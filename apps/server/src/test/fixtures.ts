import { randomUUID } from 'node:crypto'
import { campaigns, emails, senders, users, type EmailRow } from '../db/schema'
import { db } from '../lib/db'

export async function insertUser(email = 'dev@example.com') {
  const [row] = await db
    .insert(users)
    .values({ googleSub: randomUUID(), email, name: 'Dev User' })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

export async function insertSender(hourlyLimit: number | null = null) {
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

export async function insertCampaign(userId: string, senderId: string) {
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

export async function insertEmail(
  campaignId: string,
  userId: string,
  senderId: string,
  seq: number,
  overrides: Partial<Pick<EmailRow, 'status' | 'scheduledAt' | 'recipient'>> = {},
): Promise<EmailRow> {
  const scheduledAt = overrides.scheduledAt ?? new Date()
  const [row] = await db
    .insert(emails)
    .values({
      campaignId,
      userId,
      senderId,
      recipient: overrides.recipient ?? `recipient-${seq}@example.com`,
      seq,
      status: overrides.status ?? 'scheduled',
      scheduledAt,
      plannedAt: scheduledAt,
    })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

export async function waitUntil(
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
