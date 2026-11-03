import { eq, inArray } from 'drizzle-orm'
import { campaigns, emails, senders } from '../../db/schema'
import { db } from '../../lib/db'
import { esClient, searchIndex } from './client'

// Loads the rows fresh from Postgres, so a document always reflects the current row
// no matter how many sync jobs for it are queued, and indexes them under _id = email id.
// Re-indexing the same id is an upsert, which is what makes retries and repeats safe.
export async function indexEmails(emailIds: readonly string[]): Promise<void> {
  if (emailIds.length === 0) return
  const rows = await db
    .select({
      email: emails,
      senderEmail: senders.email,
      subject: campaigns.subject,
      bodyText: campaigns.bodyText,
    })
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(inArray(emails.id, [...emailIds]))
  if (rows.length === 0) return

  const operations = rows.flatMap((row) => [
    { index: { _index: searchIndex.alias, _id: row.email.id } },
    {
      userId: row.email.userId,
      campaignId: row.email.campaignId,
      senderId: row.email.senderId,
      senderEmail: row.senderEmail,
      status: row.email.status,
      recipient: row.email.recipient,
      subject: row.subject,
      bodyText: row.bodyText,
      scheduledAt: row.email.scheduledAt.toISOString(),
      sentAt: row.email.sentAt ? row.email.sentAt.toISOString() : null,
      createdAt: row.email.createdAt.toISOString(),
    },
  ])
  const response = await esClient.bulk({ operations, refresh: false })
  if (response.errors) {
    const failed = response.items.find((item) => item.index?.error)
    // Throwing hands the job back to BullMQ's retry with backoff.
    throw new Error(`bulk index failed: ${failed?.index?.error?.reason ?? 'unknown reason'}`)
  }
}
