import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../../config/env'
import { campaigns, emailEvents, emails, senders, users, type EmailRow } from '../../db/schema'
import { db } from '../../lib/db'
import { closeMailer } from '../../lib/mailer'
import { cleanDatabase, flushTestRedis } from '../../test/setup-int-db'
import { now as redisNow } from '../rate-limit/limiter'
import { closeQueues, emailSendQueue, notificationsQueue } from '../queues'
import { startSendWorker } from './send'

async function insertUser() {
  const [row] = await db
    .insert(users)
    .values({ googleSub: randomUUID(), email: 'dev@example.com', name: 'Dev User' })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function insertSender(hourlyLimit: number | null = null) {
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
      hourlyLimit,
    })
    .returning({ id: senders.id })
  if (!row) throw new Error('seed failed')
  return row.id
}

async function insertCampaign(userId: string, senderId: string) {
  const [row] = await db
    .insert(campaigns)
    .values({
      userId,
      senderId,
      subject: 'Hello',
      bodyHtml: '<p>hi</p>',
      bodyText: 'hi',
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 1000,
      total: 3,
    })
    .returning({ id: campaigns.id })
  if (!row) throw new Error('seed failed')
  return row.id
}

async function insertEmail(
  campaignId: string,
  userId: string,
  senderId: string,
  seq: number,
): Promise<EmailRow> {
  const [row] = await db
    .insert(emails)
    .values({
      campaignId,
      userId,
      senderId,
      recipient: `recipient-${seq}@example.com`,
      seq,
      status: 'scheduled',
      scheduledAt: new Date(),
      plannedAt: new Date(),
    })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('condition was not met before the timeout')
}

describe('send worker', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
  })

  it('sends each scheduled email exactly once over the json transport', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    const campaignId = await insertCampaign(user.id, senderId)
    const rows = await Promise.all(
      [0, 1, 2].map((seq) => insertEmail(campaignId, user.id, senderId, seq)),
    )
    const ids = rows.map((row) => row.id)

    await emailSendQueue.addBulk(
      ids.map((id) => ({ name: 'send', data: { emailId: id }, opts: { jobId: id, delay: 0 } })),
    )

    const worker = startSendWorker()
    try {
      await waitUntil(async () => {
        const sent = await db.select().from(emails).where(inArray(emails.id, ids))
        return sent.every((row) => row.status === 'sent')
      })
    } finally {
      await worker.close()
    }

    const finalRows = await db.select().from(emails).where(inArray(emails.id, ids))
    expect(finalRows).toHaveLength(3)
    expect(finalRows.every((row) => row.status === 'sent')).toBe(true)
    expect(finalRows.every((row) => row.sentAt !== null)).toBe(true)
    expect(new Set(finalRows.map((row) => row.messageId)).size).toBe(3)

    // Re-adding the same ids must not send them again: jobId = emailId makes it a no-op,
    // and transition()'s guard would skip a terminal row even if it somehow ran again.
    await emailSendQueue.addBulk(
      ids.map((id) => ({ name: 'send', data: { emailId: id }, opts: { jobId: id, delay: 0 } })),
    )
    const counts = await emailSendQueue.getJobCounts('waiting', 'active', 'delayed')
    expect((counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)).toBe(0)
  })

  it('does not reprocess an email whose row is already sent', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    const campaignId = await insertCampaign(user.id, senderId)
    const [row] = await Promise.all([insertEmail(campaignId, user.id, senderId, 0)])
    if (!row) throw new Error('seed failed')
    await db
      .update(emails)
      .set({ status: 'sent', sentAt: new Date(), messageId: 'already-sent' })
      .where(eq(emails.id, row.id))

    await emailSendQueue.add('send', { emailId: row.id }, { jobId: row.id })
    const worker = startSendWorker()
    try {
      await waitUntil(
        async () => (await emailSendQueue.getJobCounts('waiting', 'active')).waiting === 0,
        5000,
      )
    } finally {
      await worker.close()
    }

    const [after] = await db.select().from(emails).where(eq(emails.id, row.id))
    expect(after?.messageId).toBe('already-sent')
  })
})

describe('send worker rate limiting', () => {
  const originalWindowMs = env.RATE_WINDOW_MS
  const originalMinIntervalMs = env.MIN_SEND_INTERVAL_MS

  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
    // A tiny window makes the "next window" arrive in seconds instead of an hour,
    // and pacing is zeroed out so the hourly cap is what pushes jobs, not spacing.
    env.RATE_WINDOW_MS = 2000
    env.MIN_SEND_INTERVAL_MS = 0
    // Windows are fixed and aligned to the epoch. A test that happens to span a
    // boundary would spread its sends over two windows and never hit the cap, so each
    // one starts just after a boundary, on Redis's clock like the limiter itself.
    const msIntoWindow = (await redisNow()) % env.RATE_WINDOW_MS
    await new Promise((resolve) => setTimeout(resolve, env.RATE_WINDOW_MS - msIntoWindow + 10))
  })

  afterEach(() => {
    env.RATE_WINDOW_MS = originalWindowMs
    env.MIN_SEND_INTERVAL_MS = originalMinIntervalMs
  })

  it('sends up to the sender cap per window and defers the rest until the next one', async () => {
    const user = await insertUser()
    const senderId = await insertSender(3)
    const campaignId = await insertCampaign(user.id, senderId)
    const rows = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((seq) => insertEmail(campaignId, user.id, senderId, seq)),
    )
    const ids = rows.map((row) => row.id)

    await emailSendQueue.addBulk(
      ids.map((id) => ({ name: 'send', data: { emailId: id }, opts: { jobId: id, delay: 0 } })),
    )

    const worker = startSendWorker()
    try {
      await waitUntil(async () => {
        const current = await db.select().from(emails).where(inArray(emails.id, ids))
        return current.every((row) => row.status === 'sent')
      }, 15_000)
    } finally {
      await worker.close()
    }

    const finalRows = await db.select().from(emails).where(inArray(emails.id, ids))
    expect(finalRows).toHaveLength(6)
    expect(finalRows.every((row) => row.status === 'sent')).toBe(true)
    expect(new Set(finalRows.map((row) => row.messageId)).size).toBe(6)

    const deferred = await db
      .select()
      .from(emailEvents)
      .where(inArray(emailEvents.emailId, ids))
    const deferredEvents = deferred.filter((event) => event.type === 'deferred')
    expect(deferredEvents).toHaveLength(3)
    for (const event of deferredEvents) {
      expect(event.data).toMatchObject({ reason: 'hourly', bucket: 'sender' })
    }

    // Three jobs tripped the sender cap in the same window, but the SET NX dedupe
    // in maybeAlertSlack collapses that into exactly one notifications job.
    const notificationJobs = await notificationsQueue.getJobs([
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
    ])
    expect(notificationJobs).toHaveLength(1)
    expect(notificationJobs[0]?.data).toMatchObject({
      kind: 'rate-limit',
      userId: user.id,
      senderId,
      campaignId,
    })

    // Re-adding the same ids is a no-op: every one of them is already terminal.
    await emailSendQueue.addBulk(
      ids.map((id) => ({ name: 'send', data: { emailId: id }, opts: { jobId: id, delay: 0 } })),
    )
    const counts = await emailSendQueue.getJobCounts('waiting', 'active', 'delayed')
    expect((counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)).toBe(0)
  })
})

// A single file-level hook: both describes above share the same queue and mailer
// singletons, so closing them from more than one afterAll would close them twice.
afterAll(async () => {
  await closeQueues()
  closeMailer()
})
