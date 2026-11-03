import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../http/app'
import { closeQueues } from '../../queue/queues'
import { insertCampaign, insertEmail, insertSender, insertUser } from '../../test/fixtures'
import { cleanDatabase, flushTestRedis } from '../../test/setup-int-db'
import { SESSION_COOKIE, signSession } from '../auth/session'

async function cookieFor(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(userId)}`
}

describe('GET /api/emails/search', () => {
  const app = createApp()

  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
  })

  afterAll(async () => {
    await closeQueues()
  })

  it('requires a session', async () => {
    const res = await request(app).get('/api/emails/search?q=ab')

    expect(res.status).toBe(401)
  })

  it('rejects a query shorter than two characters', async () => {
    const user = await insertUser()

    const res = await request(app)
      .get('/api/emails/search?q=a')
      .set('Cookie', await cookieFor(user.id))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_failed')
  })

  it('is answered by search, not read as an email id', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    const campaignId = await insertCampaign(user.id, senderId)
    await insertEmail(campaignId, user.id, senderId, 0, { recipient: 'findme@example.com' })

    const res = await request(app)
      .get('/api/emails/search?q=findme&tab=all')
      .set('Cookie', await cookieFor(user.id))

    expect(res.status).toBe(200)
    expect(['elasticsearch', 'postgres']).toContain(res.body.engine)
    expect(Array.isArray(res.body.items)).toBe(true)
  })
})
