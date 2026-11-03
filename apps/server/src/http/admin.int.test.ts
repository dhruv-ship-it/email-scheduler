import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { SESSION_COOKIE, signSession } from '../modules/auth/session'
import { closeQueues } from '../queue/queues'
import { insertUser } from '../test/fixtures'
import { cleanDatabase, flushTestRedis } from '../test/setup-int-db'
import { createApp } from './app'

async function cookieFor(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(userId)}`
}

describe('Bull Board', () => {
  const originalReadOnly = env.BULL_BOARD_READ_ONLY

  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
  })

  afterAll(async () => {
    env.BULL_BOARD_READ_ONLY = originalReadOnly
    await closeQueues()
  })

  it('is not reachable without a session', async () => {
    const res = await request(createApp()).get('/api/admin/queues')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('serves the dashboard to a signed-in user', async () => {
    const user = await insertUser()

    const res = await request(createApp())
      .get('/api/admin/queues')
      .set('Cookie', await cookieFor(user.id))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('static/js')
  })

  it('lists the three queues', async () => {
    const user = await insertUser()

    const res = await request(createApp())
      .get('/api/admin/queues/api/queues')
      .set('Cookie', await cookieFor(user.id))

    expect(res.status).toBe(200)
    const names = (res.body.queues as { name: string }[]).map((queue) => queue.name).sort()
    expect(names).toEqual(['email-send', 'notifications', 'search-sync'])
  })

  it('is read-only when the environment says so', async () => {
    const user = await insertUser()
    env.BULL_BOARD_READ_ONLY = true

    const res = await request(createApp())
      .get('/api/admin/queues/api/queues')
      .set('Cookie', await cookieFor(user.id))

    expect(res.status).toBe(200)
    expect((res.body.queues as { readOnlyMode: boolean }[]).every((q) => q.readOnlyMode)).toBe(true)
  })

  it('accepts a bodiless write from the dashboard, which sends no content type', async () => {
    const user = await insertUser()

    const res = await request(createApp())
      .put('/api/admin/queues/api/queues/no-such-queue/pause')
      .set('Cookie', await cookieFor(user.id))

    // The JSON-only guard must not reject it; the board itself decides what happens.
    expect(res.status).not.toBe(415)
  })
})
