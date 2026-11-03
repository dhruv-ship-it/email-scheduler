import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { campaigns, emailEvents, emails, senders, users, type UserRow } from '../../db/schema'
import { db } from '../../lib/db'
import { cleanDatabase } from '../../test/setup-int-db'

const { remove, add } = vi.hoisted(() => ({
  remove: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../queue/queues', () => ({
  emailSendQueue: { remove },
  searchSyncQueue: { add },
  notificationsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

const { findUserById } = vi.hoisted(() => ({ findUserById: vi.fn() }))
vi.mock('../auth/users', () => ({
  findUserById,
  upsertGoogleUser: vi.fn(),
  toMe: vi.fn(),
}))

const { createApp } = await import('../../http/app')
const { signSession } = await import('../auth/session')

async function insertUser(email = 'dev@example.com'): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({ googleSub: randomUUID(), email, name: 'Dev User' })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function insertSender(): Promise<string> {
  const [row] = await db
    .insert(senders)
    .values({
      name: 'Sender 1',
      email: `${randomUUID()}@ethereal.email`,
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'user',
      smtpPassEnc: 'iv.tag.data',
    })
    .returning({ id: senders.id })
  if (!row) throw new Error('seed failed')
  return row.id
}

async function insertCampaign(userId: string, senderId: string): Promise<string> {
  const [row] = await db
    .insert(campaigns)
    .values({
      userId,
      senderId,
      subject: 'Hello there',
      bodyHtml: '<p>hi</p>',
      bodyText: 'hi',
      startAt: new Date(),
      delayMs: 1000,
      hourlyLimit: 10,
      total: 1,
    })
    .returning({ id: campaigns.id })
  if (!row) throw new Error('seed failed')
  return row.id
}

type EmailOverrides = Partial<typeof emails.$inferInsert>

async function insertEmail(
  campaignId: string,
  userId: string,
  senderId: string,
  overrides: EmailOverrides = {},
) {
  const [row] = await db
    .insert(emails)
    .values({
      campaignId,
      userId,
      senderId,
      recipient: `${randomUUID()}@example.com`,
      seq: 0,
      status: 'scheduled',
      scheduledAt: new Date(),
      plannedAt: new Date(),
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

let me: UserRow
let senderId: string
let campaignId: string

function agentFor(user: UserRow) {
  async function cookie(): Promise<string> {
    return `sid=${await signSession(user.id)}`
  }
  return {
    get: async (path: string) =>
      request(createApp())
        .get(path)
        .set('Cookie', await cookie()),
    patch: async (path: string, body: Record<string, unknown>) =>
      request(createApp())
        .patch(path)
        .set('Cookie', await cookie())
        .set('Content-Type', 'application/json')
        .send(body),
    post: async (path: string) =>
      request(createApp())
        .post(path)
        .set('Cookie', await cookie())
        .set('Content-Type', 'application/json')
        .send(),
  }
}

describe('email endpoints', () => {
  beforeEach(async () => {
    await cleanDatabase()
    remove.mockClear()
    add.mockClear()
    me = await insertUser()
    findUserById.mockResolvedValue(me)
    senderId = await insertSender()
    campaignId = await insertCampaign(me.id, senderId)
  })

  describe('GET /api/emails', () => {
    it('orders the scheduled tab by scheduled_at ascending', async () => {
      const now = Date.now()
      const late = await insertEmail(campaignId, me.id, senderId, {
        scheduledAt: new Date(now + 300_000),
      })
      const early = await insertEmail(campaignId, me.id, senderId, {
        scheduledAt: new Date(now + 100_000),
      })
      const mid = await insertEmail(campaignId, me.id, senderId, {
        scheduledAt: new Date(now + 200_000),
      })

      const res = await agentFor(me).get('/api/emails?tab=scheduled')
      expect(res.status).toBe(200)
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
        early.id,
        mid.id,
        late.id,
      ])
    })

    it('orders the sent tab by sent_at descending', async () => {
      const now = Date.now()
      const older = await insertEmail(campaignId, me.id, senderId, {
        status: 'sent',
        sentAt: new Date(now - 10_000),
      })
      const newer = await insertEmail(campaignId, me.id, senderId, {
        status: 'sent',
        sentAt: new Date(now - 1_000),
      })

      const res = await agentFor(me).get('/api/emails?tab=sent')
      expect(res.status).toBe(200)
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([newer.id, older.id])
    })

    it('narrows the scheduled tab with a status filter', async () => {
      await insertEmail(campaignId, me.id, senderId, { status: 'scheduled' })
      const throttled = await insertEmail(campaignId, me.id, senderId, {
        status: 'throttled',
        throttledBy: 'sender',
      })
      await insertEmail(campaignId, me.id, senderId, { status: 'sending' })

      const res = await agentFor(me).get('/api/emails?tab=scheduled&status=throttled')
      expect(res.status).toBe(200)
      expect(res.body.items).toHaveLength(1)
      expect(res.body.items[0].id).toBe(throttled.id)
      expect(res.body.items[0].throttledBy).toBe('sender')
    })

    it('filters to starred rows only', async () => {
      await insertEmail(campaignId, me.id, senderId, { starred: false })
      const starred = await insertEmail(campaignId, me.id, senderId, { starred: true })

      const res = await agentFor(me).get('/api/emails?tab=scheduled&starred=true')
      expect(res.status).toBe(200)
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([starred.id])
    })

    it('paginates with a cursor that does not repeat or skip rows', async () => {
      const now = Date.now()
      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        const row = await insertEmail(campaignId, me.id, senderId, {
          scheduledAt: new Date(now + i * 1000),
        })
        ids.push(row.id)
      }

      const first = await agentFor(me).get('/api/emails?tab=scheduled&limit=2')
      expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([ids[0], ids[1]])
      expect(first.body.nextCursor).not.toBeNull()

      const second = await agentFor(me).get(
        `/api/emails?tab=scheduled&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([ids[2]])
      expect(second.body.nextCursor).toBeNull()
    })

    it('never shows another user their rows', async () => {
      const other = await insertUser('other@example.com')
      const otherSenderId = await insertSender()
      const otherCampaignId = await insertCampaign(other.id, otherSenderId)
      await insertEmail(otherCampaignId, other.id, otherSenderId)
      await insertEmail(campaignId, me.id, senderId)

      const res = await agentFor(me).get('/api/emails?tab=scheduled')
      expect(res.body.items).toHaveLength(1)
    })
  })

  describe('GET /api/emails/stats', () => {
    it('counts rows per status for the signed-in user', async () => {
      await insertEmail(campaignId, me.id, senderId, { status: 'scheduled' })
      await insertEmail(campaignId, me.id, senderId, { status: 'scheduled' })
      await insertEmail(campaignId, me.id, senderId, { status: 'sent', sentAt: new Date() })

      const res = await agentFor(me).get('/api/emails/stats')
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        scheduled: 2,
        sent: 1,
        throttled: 0,
        sending: 0,
        failed: 0,
        cancelled: 0,
      })
    })
  })

  describe('GET /api/emails/:id', () => {
    it('includes events ordered by time', async () => {
      const email = await insertEmail(campaignId, me.id, senderId)
      await db.insert(emailEvents).values([
        {
          emailId: email.id,
          type: 'scheduled',
          data: { plannedAt: email.plannedAt.toISOString() },
        },
        { emailId: email.id, type: 'sending', data: { attempt: 1 } },
      ])

      const res = await agentFor(me).get(`/api/emails/${email.id}`)
      expect(res.status).toBe(200)
      expect(res.body.events.map((e: { type: string }) => e.type)).toEqual(['scheduled', 'sending'])
      expect(res.body.subject).toBe('Hello there')
    })

    it('returns 404 for another user email', async () => {
      const other = await insertUser('other@example.com')
      const email = await insertEmail(campaignId, other.id, senderId)
      const res = await agentFor(me).get(`/api/emails/${email.id}`)
      expect(res.status).toBe(404)
    })

    it('returns 404 instead of a database error for a malformed id', async () => {
      const res = await agentFor(me).get('/api/emails/not-a-uuid')
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/emails/:id', () => {
    it('toggles the star and persists it', async () => {
      const email = await insertEmail(campaignId, me.id, senderId)
      const res = await agentFor(me).patch(`/api/emails/${email.id}`, { starred: true })
      expect(res.status).toBe(200)
      expect(res.body.starred).toBe(true)

      const [row] = await db.select().from(emails).where(eq(emails.id, email.id))
      expect(row?.starred).toBe(true)
    })

    it('returns 404 for an email owned by someone else', async () => {
      const other = await insertUser('other@example.com')
      const email = await insertEmail(campaignId, other.id, senderId)
      const res = await agentFor(me).patch(`/api/emails/${email.id}`, { starred: true })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/emails/:id/cancel', () => {
    it('cancels a scheduled email and records an event', async () => {
      const email = await insertEmail(campaignId, me.id, senderId)
      const res = await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('cancelled')
      expect(remove).toHaveBeenCalledWith(email.id)

      const [row] = await db.select().from(emails).where(eq(emails.id, email.id))
      expect(row?.status).toBe('cancelled')
      const events = await db.select().from(emailEvents).where(eq(emailEvents.emailId, email.id))
      expect(events.map((e) => e.type)).toContain('cancelled')
    })

    it('cancels a throttled email', async () => {
      const email = await insertEmail(campaignId, me.id, senderId, {
        status: 'throttled',
        throttledBy: 'sender',
      })
      const res = await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      expect(res.status).toBe(200)
    })

    it('returns 409 for an email that is already sent', async () => {
      const email = await insertEmail(campaignId, me.id, senderId, {
        status: 'sent',
        sentAt: new Date(),
      })
      const res = await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('conflict')
    })

    it('returns 409 on a second cancel attempt', async () => {
      const email = await insertEmail(campaignId, me.id, senderId)
      await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      const res = await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      expect(res.status).toBe(409)
    })

    it('returns 404 for an email owned by someone else', async () => {
      const other = await insertUser('other@example.com')
      const email = await insertEmail(campaignId, other.id, senderId)
      const res = await agentFor(me).post(`/api/emails/${email.id}/cancel`)
      expect(res.status).toBe(404)
    })
  })
})
