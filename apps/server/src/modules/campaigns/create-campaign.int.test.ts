import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { campaigns, emails, senders, users } from '../../db/schema'
import { db } from '../../lib/db'
import { ApiError } from '../../lib/errors'
import { cleanDatabase } from '../../test/setup-int-db'

const { addBulk, add } = vi.hoisted(() => ({
  addBulk: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../queue/queues', () => ({
  emailSendQueue: { addBulk },
  searchSyncQueue: { add },
  notificationsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

const { createCampaign } = await import('./create-campaign')

async function insertUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ googleSub: randomUUID(), email: 'dev@example.com', name: 'Dev User' })
    .returning({ id: users.id })
  if (!row) throw new Error('user insert returned no row')
  return row.id
}

async function insertSender(hourlyLimit: number | null = null): Promise<string> {
  const [row] = await db
    .insert(senders)
    .values({
      name: 'Sender 1',
      email: `sender-${randomUUID()}@ethereal.email`,
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'user',
      smtpPassEnc: 'iv.tag.data',
      hourlyLimit,
    })
    .returning({ id: senders.id })
  if (!row) throw new Error('sender insert returned no row')
  return row.id
}

function baseInput(overrides: Partial<Parameters<typeof createCampaign>[0]> = {}) {
  return {
    userId: '',
    senderId: '',
    subject: 'Hello',
    bodyHtml: '<p>hi there</p>',
    startAt: new Date(Date.now() + 60_000).toISOString(),
    delaySeconds: 2,
    hourlyLimit: 100,
    recipients: ['a@example.com'],
    ...overrides,
  }
}

describe('createCampaign', () => {
  beforeEach(async () => {
    await cleanDatabase()
    addBulk.mockClear()
    add.mockClear()
  })

  it('dedupes and counts recipients, storing one row per accepted address', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    const result = await createCampaign(
      baseInput({
        userId,
        senderId,
        recipients: ['a@example.com', 'A@Example.com', 'not-an-email', 'b@example.com'],
      }),
    )
    expect(result.accepted).toBe(2)
    expect(result.duplicates).toBe(1)
    expect(result.invalid).toBe(1)
    expect(result.queued).toBe(true)

    const rows = await db.select().from(emails).where(eq(emails.campaignId, result.campaignId))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.recipient).sort()).toEqual(['a@example.com', 'b@example.com'])
  })

  it('enqueues one send job per email with jobId = email id and a delay matching the plan', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    const startAt = Date.now() + 10_000
    const result = await createCampaign(
      baseInput({
        userId,
        senderId,
        startAt: new Date(startAt).toISOString(),
        delaySeconds: 5,
        recipients: ['a@example.com', 'b@example.com', 'c@example.com'],
      }),
    )

    const rows = await db
      .select()
      .from(emails)
      .where(eq(emails.campaignId, result.campaignId))
      .orderBy(emails.seq)
    expect(addBulk).toHaveBeenCalledTimes(1)
    const jobs = addBulk.mock.calls[0]?.[0] as {
      name: string
      data: { emailId: string }
      opts: { jobId: string; delay: number }
    }[]
    expect(jobs).toHaveLength(3)
    for (const [i, row] of rows.entries()) {
      const job = jobs[i]
      expect(job?.name).toBe('send')
      expect(job?.data.emailId).toBe(row.id)
      expect(job?.opts.jobId).toBe(row.id)
      const expectedDelay = Math.max(0, row.scheduledAt.getTime() - Date.now())
      expect(job?.opts.delay).toBeGreaterThanOrEqual(expectedDelay - 1000)
      expect(job?.opts.delay).toBeLessThanOrEqual(expectedDelay + 1000)
    }
    expect(add).toHaveBeenCalledWith('sync', { emailIds: rows.map((r) => r.id) })
  })

  it('returns 503 when no senders are set up yet', async () => {
    const userId = await insertUser()
    await expect(
      createCampaign(baseInput({ userId, senderId: randomUUID() })),
    ).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('returns 404 for a sender id that does not exist when other senders do', async () => {
    const userId = await insertUser()
    await insertSender()
    await expect(
      createCampaign(baseInput({ userId, senderId: randomUUID() })),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('rejects a delay below the server minimum', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    await expect(
      createCampaign(baseInput({ userId, senderId, delaySeconds: 0 })),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects a body that sanitizes down to no text', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    await expect(
      createCampaign(baseInput({ userId, senderId, bodyHtml: '<script>alert(1)</script>' })),
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('rejects when every recipient is invalid', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    await expect(
      createCampaign(baseInput({ userId, senderId, recipients: ['not-an-email', 'also-bad'] })),
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('stores the sanitized html rather than the raw input', async () => {
    const userId = await insertUser()
    const senderId = await insertSender()
    const result = await createCampaign(
      baseInput({
        userId,
        senderId,
        bodyHtml: '<p onclick="x()">hi there</p><script>bad()</script>',
      }),
    )
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    expect(campaign?.bodyHtml).not.toContain('onclick')
    expect(campaign?.bodyHtml).not.toContain('script')
    expect(campaign?.bodyText.trim()).toBe('hi there')
  })
})
