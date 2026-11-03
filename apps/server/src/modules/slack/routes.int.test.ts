import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../config/env'
import { slackConnections } from '../../db/schema'
import { db } from '../../lib/db'
import { decrypt } from '../../lib/crypto'
import { createApp } from '../../http/app'
import { closeQueues } from '../../queue/queues'
import { insertUser } from '../../test/fixtures'
import { cleanDatabase, flushTestRedis } from '../../test/setup-int-db'
import { SESSION_COOKIE, signSession } from '../auth/session'
import { upsertConnection } from './connection'
import { signSlackState } from './state'

const WEBHOOK_URL = 'https://hooks.slack.com/services/T0001/B0001/secret'
const ACCESS_TOKEN = 'xoxb-secret-token'

const fetchMock = vi.fn<typeof fetch>()

function slackOk(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      access_token: ACCESS_TOKEN,
      team: { id: 'T0001', name: 'Acme' },
      incoming_webhook: { channel: '#alerts', channel_id: 'C0001', url: WEBHOOK_URL },
    }),
    { status: 200 },
  )
}

async function cookieFor(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(userId)}`
}

async function connectionFor(userId: string) {
  const [row] = await db.select().from(slackConnections).where(eq(slackConnections.userId, userId))
  return row
}

async function seedConnection(userId: string): Promise<void> {
  await upsertConnection({
    userId,
    teamId: 'T0001',
    teamName: 'Acme',
    channelId: 'C0001',
    channelName: 'alerts',
    webhookUrl: WEBHOOK_URL,
    accessToken: ACCESS_TOKEN,
  })
}

describe('slack integration routes', () => {
  const app = createApp()
  const original = { id: env.SLACK_CLIENT_ID, secret: env.SLACK_CLIENT_SECRET }

  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
    env.SLACK_CLIENT_ID = 'client-id'
    env.SLACK_CLIENT_SECRET = 'client-secret'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    env.SLACK_CLIENT_ID = original.id
    env.SLACK_CLIENT_SECRET = original.secret
  })

  afterAll(async () => {
    await closeQueues()
  })

  describe('when slack is not configured', () => {
    beforeEach(() => {
      env.SLACK_CLIENT_ID = ''
      env.SLACK_CLIENT_SECRET = ''
    })

    it('reports that in the status', async () => {
      const user = await insertUser()

      const res = await request(app)
        .get('/api/integrations/slack')
        .set('Cookie', await cookieFor(user.id))

      expect(res.body).toEqual({ configured: false, connected: false })
    })

    it('answers 404 to connect and to the callback', async () => {
      const user = await insertUser()

      const connect = await request(app)
        .get('/api/integrations/slack/connect')
        .set('Cookie', await cookieFor(user.id))
      const callback = await request(app).get('/api/integrations/slack/callback?code=x&state=y')

      expect(connect.status).toBe(404)
      expect(connect.body.error.message).toBe("Slack isn't configured on this server.")
      expect(callback.status).toBe(404)
    })
  })

  describe('connect', () => {
    it('sends the browser to slack with a signed state', async () => {
      const user = await insertUser()

      const res = await request(app)
        .get('/api/integrations/slack/connect')
        .set('Cookie', await cookieFor(user.id))

      expect(res.status).toBe(302)
      const location = new URL(res.headers['location'] as string)
      expect(location.origin + location.pathname).toBe('https://slack.com/oauth/v2/authorize')
      expect(location.searchParams.get('client_id')).toBe('client-id')
      expect(location.searchParams.get('scope')).toBe('incoming-webhook')
      expect(location.searchParams.get('redirect_uri')).toContain(
        '/api/integrations/slack/callback',
      )
      expect(location.searchParams.get('state')).toBeTruthy()
    })

    it('requires a session', async () => {
      const res = await request(app).get('/api/integrations/slack/connect')

      expect(res.status).toBe(401)
    })
  })

  describe('callback', () => {
    it('rejects a tampered state without calling slack', async () => {
      const user = await insertUser()
      const state = await signSlackState(user.id)
      // Change a signature character that carries all six bits (the last one does not).
      const [header, payload, signature = ''] = state.split('.')
      const tampered = `${header}.${payload}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`

      const res = await request(app).get(
        `/api/integrations/slack/callback?code=abc&state=${tampered}`,
      )

      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe(`${env.APP_URL}/?slack=error`)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await connectionFor(user.id)).toBeUndefined()
    })

    it('rejects an expired state without calling slack', async () => {
      const user = await insertUser()
      const state = await signSlackState(user.id, -60)

      const res = await request(app).get(`/api/integrations/slack/callback?code=abc&state=${state}`)

      expect(res.headers['location']).toBe(`${env.APP_URL}/?slack=error`)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await connectionFor(user.id)).toBeUndefined()
    })

    it('reports a denied authorization', async () => {
      const res = await request(app).get('/api/integrations/slack/callback?error=access_denied')

      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe(`${env.APP_URL}/?slack=denied`)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('stores the connection with its secrets encrypted', async () => {
      const user = await insertUser()
      const state = await signSlackState(user.id)
      fetchMock.mockResolvedValueOnce(slackOk())

      const res = await request(app).get(`/api/integrations/slack/callback?code=abc&state=${state}`)

      expect(res.headers['location']).toBe(`${env.APP_URL}/?slack=connected`)
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe('https://slack.com/api/oauth.v2.access')
      expect(String((init as RequestInit).body)).toContain('code=abc')

      const row = await connectionFor(user.id)
      expect(row).toMatchObject({ teamId: 'T0001', teamName: 'Acme', channelName: 'alerts' })
      expect(row?.webhookUrlEnc).not.toContain('hooks.slack.com')
      expect(row?.accessTokenEnc).not.toContain(ACCESS_TOKEN)
      expect(decrypt(row?.webhookUrlEnc ?? '')).toBe(WEBHOOK_URL)
      expect(decrypt(row?.accessTokenEnc ?? '')).toBe(ACCESS_TOKEN)
    })

    it('replaces an existing connection instead of adding a second one', async () => {
      const user = await insertUser()
      await seedConnection(user.id)
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            access_token: 'xoxb-new',
            team: { id: 'T0002', name: 'Other team' },
            incoming_webhook: { channel: '#ops', channel_id: 'C0002', url: `${WEBHOOK_URL}2` },
          }),
        ),
      )

      await request(app).get(
        `/api/integrations/slack/callback?code=abc&state=${await signSlackState(user.id)}`,
      )

      const rows = await db.select().from(slackConnections)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ teamName: 'Other team', channelName: 'ops' })
    })

    it('reports an error when slack refuses the code', async () => {
      const user = await insertUser()
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'invalid_code' })),
      )

      const res = await request(app).get(
        `/api/integrations/slack/callback?code=bad&state=${await signSlackState(user.id)}`,
      )

      expect(res.headers['location']).toBe(`${env.APP_URL}/?slack=error`)
      expect(await connectionFor(user.id)).toBeUndefined()
    })
  })

  describe('status, test message and disconnect', () => {
    it('shows the workspace and channel once connected', async () => {
      const user = await insertUser()
      await seedConnection(user.id)

      const res = await request(app)
        .get('/api/integrations/slack')
        .set('Cookie', await cookieFor(user.id))

      expect(res.body).toMatchObject({
        configured: true,
        connected: true,
        teamName: 'Acme',
        channelName: 'alerts',
      })
    })

    it('posts the test message to the stored webhook', async () => {
      const user = await insertUser()
      await seedConnection(user.id)
      fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const res = await request(app)
        .post('/api/integrations/slack/test')
        .set('Cookie', await cookieFor(user.id))
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(204)
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe(WEBHOOK_URL)
      expect(JSON.parse(String((init as RequestInit).body)).text).toContain(
        'Slack alerts are connected.',
      )
    })

    it('answers 400 to the test message when nothing is connected', async () => {
      const user = await insertUser()

      const res = await request(app)
        .post('/api/integrations/slack/test')
        .set('Cookie', await cookieFor(user.id))
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('drops a connection whose webhook slack no longer recognises', async () => {
      const user = await insertUser()
      await seedConnection(user.id)
      fetchMock.mockResolvedValueOnce(new Response('no_service', { status: 404 }))

      const res = await request(app)
        .post('/api/integrations/slack/test')
        .set('Cookie', await cookieFor(user.id))
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(409)
      expect(await connectionFor(user.id)).toBeUndefined()
    })

    it('disconnects: revokes the token and deletes the row', async () => {
      const user = await insertUser()
      await seedConnection(user.id)
      fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

      const res = await request(app)
        .delete('/api/integrations/slack')
        .set('Cookie', await cookieFor(user.id))
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(204)
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe('https://slack.com/api/auth.revoke')
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      })
      expect(await connectionFor(user.id)).toBeUndefined()
    })

    it('still disconnects when slack cannot be reached', async () => {
      const user = await insertUser()
      await seedConnection(user.id)
      fetchMock.mockRejectedValueOnce(new Error('network down'))

      const res = await request(app)
        .delete('/api/integrations/slack')
        .set('Cookie', await cookieFor(user.id))
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(204)
      expect(await connectionFor(user.id)).toBeUndefined()
    })
  })
})
