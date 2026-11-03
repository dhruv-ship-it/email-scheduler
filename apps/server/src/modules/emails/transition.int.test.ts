import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { campaigns, emailEvents, emails, senders, users, type EmailRow } from '../../db/schema'
import { db } from '../../lib/db'
import { closeQueues } from '../../queue/queues'
import { cleanDatabase } from '../../test/setup-int-db'
import { transition } from './transition'

async function seedEmail(status: EmailRow['status'] = 'scheduled'): Promise<EmailRow> {
  const [user] = await db
    .insert(users)
    .values({ googleSub: randomUUID(), email: 'dev@example.com', name: 'Dev User' })
    .returning()
  const [sender] = await db
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
    .returning()
  if (!user || !sender) throw new Error('seed failed')
  const [campaign] = await db
    .insert(campaigns)
    .values({
      userId: user.id,
      senderId: sender.id,
      subject: 'hi',
      bodyHtml: '<p>hi</p>',
      bodyText: 'hi',
      startAt: new Date(),
      delayMs: 1000,
      hourlyLimit: 10,
      total: 1,
    })
    .returning()
  if (!campaign) throw new Error('seed failed')
  const [email] = await db
    .insert(emails)
    .values({
      campaignId: campaign.id,
      userId: user.id,
      senderId: sender.id,
      recipient: 'a@example.com',
      seq: 0,
      status,
      scheduledAt: new Date(),
      plannedAt: new Date(),
      throttledBy: status === 'throttled' ? 'sender' : null,
    })
    .returning()
  if (!email) throw new Error('seed failed')
  return email
}

describe('transition', () => {
  beforeEach(cleanDatabase)
  afterAll(closeQueues)

  it('updates the row and inserts an event when the guard matches', async () => {
    const email = await seedEmail('scheduled')
    const updated = await transition(
      email.id,
      ['scheduled', 'throttled'],
      'sending',
      { attempts: 1 },
      {
        type: 'sending',
        data: { attempt: 1 },
      },
    )
    expect(updated?.status).toBe('sending')
    expect(updated?.attempts).toBe(1)
    const events = await db.select().from(emailEvents).where(eq(emailEvents.emailId, email.id))
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('sending')
  })

  it('returns null and changes nothing when the current status is outside the guard list', async () => {
    const email = await seedEmail('sent')
    const updated = await transition(email.id, ['scheduled', 'throttled'], 'sending')
    expect(updated).toBeNull()
    const [row] = await db.select().from(emails).where(eq(emails.id, email.id))
    expect(row?.status).toBe('sent')
    const events = await db.select().from(emailEvents).where(eq(emailEvents.emailId, email.id))
    expect(events).toHaveLength(0)
  })

  it('clears throttled_by when moving into sending', async () => {
    const email = await seedEmail('throttled')
    const updated = await transition(email.id, ['scheduled', 'throttled'], 'sending')
    expect(updated?.throttledBy).toBeNull()
  })

  it('does not insert an event when none is given', async () => {
    const email = await seedEmail('scheduled')
    await transition(email.id, ['scheduled'], 'cancelled')
    const events = await db.select().from(emailEvents).where(eq(emailEvents.emailId, email.id))
    expect(events).toHaveLength(0)
  })
})
