import { eq, inArray } from 'drizzle-orm'
import { UnrecoverableError, Worker } from 'bullmq'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { emailEvents, emails } from '../db/schema'
import { db } from '../lib/db'
import { closeMailer } from '../lib/mailer'
import { createCampaign } from '../modules/campaigns/create-campaign'
import { cleanDatabase, flushTestRedis } from '../test/setup-int-db'
import { insertCampaign, insertEmail, insertSender, insertUser, waitUntil } from '../test/fixtures'
import { createConnection } from './connection'
import { reconcile } from './reconcile'
import { closeQueues, EMAIL_SEND_QUEUE, emailSendQueue } from './queues'
import { startSendWorker } from './workers/send'

const HOUR_MS = 3_600_000

async function queuedJobCount(): Promise<number> {
  const counts = await emailSendQueue.getJobCounts('waiting', 'active', 'delayed', 'prioritized')
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function requeuedEvents(emailIds: string[]) {
  const rows = await db.select().from(emailEvents).where(inArray(emailEvents.emailId, emailIds))
  return rows.filter((row) => row.type === 'requeued')
}

async function seedPending(
  count: number,
  scheduledAtFor: (seq: number) => Date = () => new Date(),
) {
  const user = await insertUser()
  const senderId = await insertSender()
  const campaignId = await insertCampaign(user.id, senderId)
  const rows = await Promise.all(
    Array.from({ length: count }, (_, seq) =>
      insertEmail(campaignId, user.id, senderId, seq, { scheduledAt: scheduledAtFor(seq) }),
    ),
  )
  return { user, senderId, campaignId, rows, ids: rows.map((row) => row.id) }
}

describe('reconcile', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
  })

  it('re-adds a job for every pending row that has none, once', async () => {
    const { ids } = await seedPending(5, (seq) => new Date(Date.now() + (seq >= 3 ? HOUR_MS : 0)))

    const result = await reconcile()

    expect(result).toEqual({ checked: 5, readded: 5, skipped: false })
    expect(await queuedJobCount()).toBe(5)

    const events = await requeuedEvents(ids)
    expect(events).toHaveLength(5)
    expect(new Set(events.map((event) => event.emailId)).size).toBe(5)
    expect(events.every((event) => (event.data as { by: string }).by === 'reconciler')).toBe(true)

    // A row planned for an hour from now keeps its place in the future.
    const later = await emailSendQueue.getJob(ids[4] as string)
    expect(later?.opts.delay).toBeGreaterThan(HOUR_MS - 60_000)
  })

  it('adds nothing on a second run', async () => {
    const { ids } = await seedPending(3)

    await reconcile()
    const second = await reconcile()

    expect(second).toEqual({ checked: 3, readded: 0, skipped: false })
    expect(await queuedJobCount()).toBe(3)
    expect(await requeuedEvents(ids)).toHaveLength(3)
  })

  it('replaces a job that already failed while its row is still pending', async () => {
    const { ids } = await seedPending(1)
    const id = ids[0] as string
    await emailSendQueue.add('send', { emailId: id }, { jobId: id })

    const connection = createConnection()
    const crasher = new Worker(
      EMAIL_SEND_QUEUE,
      async () => {
        throw new UnrecoverableError('simulated loss')
      },
      { connection },
    )
    try {
      await waitUntil(
        async () => (await (await emailSendQueue.getJob(id))?.getState()) === 'failed',
      )
    } finally {
      await crasher.close()
      await connection.quit()
    }

    const result = await reconcile()

    expect(result.readded).toBe(1)
    const state = await (await emailSendQueue.getJob(id))?.getState()
    expect(['waiting', 'delayed']).toContain(state)
    expect(await requeuedEvents(ids)).toHaveLength(1)
  })

  it('sends nothing for a row that is already sent', async () => {
    const { user, senderId, campaignId, rows } = await seedPending(1)
    const pending = rows[0]
    if (!pending) throw new Error('seed failed')
    const sent = await insertEmail(campaignId, user.id, senderId, 1, { status: 'sent' })
    await db
      .update(emails)
      .set({ sentAt: new Date(), messageId: 'already-sent' })
      .where(eq(emails.id, sent.id))
    // A leftover job for the sent row, as a crash between the send and the cleanup would leave.
    await emailSendQueue.add('send', { emailId: sent.id }, { jobId: sent.id })

    const result = await reconcile()
    expect(result).toEqual({ checked: 1, readded: 1, skipped: false })

    const worker = startSendWorker()
    try {
      await waitUntil(async () => {
        const [row] = await db.select().from(emails).where(eq(emails.id, pending.id))
        return row?.status === 'sent' && (await queuedJobCount()) === 0
      })
    } finally {
      await worker.close()
    }

    const [after] = await db.select().from(emails).where(eq(emails.id, sent.id))
    expect(after?.messageId).toBe('already-sent')
    const events = await db.select().from(emailEvents).where(eq(emailEvents.emailId, sent.id))
    expect(events).toHaveLength(0)
  })
})

describe('adding a campaign jobs twice', () => {
  const originalMinIntervalMs = env.MIN_SEND_INTERVAL_MS

  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
    env.MIN_SEND_INTERVAL_MS = 0
  })

  afterEach(() => {
    env.MIN_SEND_INTERVAL_MS = originalMinIntervalMs
  })

  it('sends each email once', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    const result = await createCampaign({
      userId: user.id,
      senderId,
      subject: 'Hello',
      bodyHtml: '<p>hello there</p>',
      startAt: new Date().toISOString(),
      delaySeconds: 0,
      hourlyLimit: 1000,
      recipients: ['a@example.com', 'b@example.com', 'c@example.com'],
    })
    const rows = await db.select().from(emails).where(eq(emails.campaignId, result.campaignId))
    const ids = rows.map((row) => row.id)
    const jobs = ids.map((id) => ({
      name: 'send',
      data: { emailId: id },
      opts: { jobId: id, delay: 0 },
    }))

    await emailSendQueue.addBulk(jobs)
    await emailSendQueue.addBulk(jobs)
    expect(await queuedJobCount()).toBe(3)

    const worker = startSendWorker()
    try {
      await waitUntil(async () => {
        const current = await db.select().from(emails).where(inArray(emails.id, ids))
        return current.every((row) => row.status === 'sent')
      })
    } finally {
      await worker.close()
    }

    const events = await db.select().from(emailEvents).where(inArray(emailEvents.emailId, ids))
    expect(events.filter((event) => event.type === 'sending')).toHaveLength(3)
    expect(events.filter((event) => event.type === 'sent')).toHaveLength(3)
    const final = await db.select().from(emails).where(inArray(emails.id, ids))
    expect(new Set(final.map((row) => row.messageId)).size).toBe(3)
  })
})

afterAll(async () => {
  await closeQueues()
  closeMailer()
})
