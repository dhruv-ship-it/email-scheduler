import {
  TAB_DEFAULT_STATUSES,
  TAB_FILTER_STATUSES,
  type EmailDetail,
  type EmailListItem,
  type EmailListResponse,
  type EmailStats,
  type EmailStatus,
  type EmailTab,
} from '@scheduler/shared'
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm'
import { campaigns, emailEvents, emails, senders, type EmailRow } from '../../db/schema'
import { db } from '../../lib/db'
import { decodeCursor, encodeCursor } from './cursor'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

export type JoinedListRow = {
  email: EmailRow
  senderName: string
  subject: string
  bodyText: string
}

export function toListItem(row: JoinedListRow): EmailListItem {
  return {
    id: row.email.id,
    recipient: row.email.recipient,
    subject: row.subject,
    snippet: row.bodyText.slice(0, 140),
    status: row.email.status,
    scheduledAt: row.email.scheduledAt.toISOString(),
    sentAt: row.email.sentAt ? row.email.sentAt.toISOString() : null,
    senderName: row.senderName,
    throttledBy: row.email.throttledBy,
    lastError: row.email.lastError,
    starred: row.email.starred,
  }
}

// The columns every list-shaped query selects, so search results come out in the
// same shape as the lists.
export const listSelection = {
  email: emails,
  senderName: senders.name,
  subject: campaigns.subject,
  bodyText: campaigns.bodyText,
}

export type EmailListQuery = {
  userId: string
  tab: EmailTab
  status?: EmailStatus
  starred?: boolean
  cursor?: string
  limit?: number
}

// Scheduled sorts by the plan (scheduled_at asc); sent sorts by when it actually
// landed, falling back to updated_at for rows that never got a sent_at (SPEC §11).
export async function listEmails(query: EmailListQuery): Promise<EmailListResponse> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const statuses =
    query.status && TAB_FILTER_STATUSES[query.tab].includes(query.status)
      ? [query.status]
      : TAB_DEFAULT_STATUSES[query.tab]
  const ascending = query.tab === 'scheduled'
  const sortExpr = ascending
    ? sql`${emails.scheduledAt}`
    : sql`coalesce(${emails.sentAt}, ${emails.updatedAt})`

  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  const cursorDate = cursor ? new Date(cursor.v) : null
  const cursorCondition =
    cursor && cursorDate
      ? ascending
        ? or(gt(sortExpr, cursorDate), and(eq(sortExpr, cursorDate), gt(emails.id, cursor.id)))
        : or(lt(sortExpr, cursorDate), and(eq(sortExpr, cursorDate), lt(emails.id, cursor.id)))
      : undefined

  const rows = await db
    .select({
      email: emails,
      senderName: senders.name,
      subject: campaigns.subject,
      bodyText: campaigns.bodyText,
    })
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(
      and(
        eq(emails.userId, query.userId),
        inArray(emails.status, statuses),
        query.starred ? eq(emails.starred, true) : undefined,
        cursorCondition,
      ),
    )
    .orderBy(
      ascending ? asc(sortExpr) : desc(sortExpr),
      ascending ? asc(emails.id) : desc(emails.id),
    )
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          v: (ascending
            ? last.email.scheduledAt
            : (last.email.sentAt ?? last.email.updatedAt)
          ).toISOString(),
          id: last.email.id,
        })
      : null

  return { items: page.map(toListItem), nextCursor }
}

export async function getEmailStats(userId: string): Promise<EmailStats> {
  const rows = await db
    .select({ status: emails.status, count: sql<number>`count(*)::int` })
    .from(emails)
    .where(eq(emails.userId, userId))
    .groupBy(emails.status)
  const stats: EmailStats = {
    scheduled: 0,
    throttled: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const row of rows) stats[row.status] = row.count
  return stats
}

export async function getEmailListItem(id: string): Promise<EmailListItem | null> {
  const [row] = await db
    .select({
      email: emails,
      senderName: senders.name,
      subject: campaigns.subject,
      bodyText: campaigns.bodyText,
    })
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(eq(emails.id, id))
    .limit(1)
  return row ? toListItem(row) : null
}

export async function getEmailDetail(userId: string, id: string): Promise<EmailDetail | null> {
  const [row] = await db
    .select({
      email: emails,
      senderName: senders.name,
      senderEmail: senders.email,
      subject: campaigns.subject,
      bodyHtml: campaigns.bodyHtml,
      bodyText: campaigns.bodyText,
    })
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(and(eq(emails.id, id), eq(emails.userId, userId)))
    .limit(1)
  if (!row) return null

  const events = await db
    .select({ type: emailEvents.type, at: emailEvents.at, data: emailEvents.data })
    .from(emailEvents)
    .where(eq(emailEvents.emailId, id))
    .orderBy(asc(emailEvents.at))

  return {
    ...toListItem(row),
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    senderEmail: row.senderEmail,
    previewUrl: row.email.previewUrl,
    attempts: row.email.attempts,
    campaignId: row.email.campaignId,
    events: events.map((event) => ({
      type: event.type,
      at: event.at.toISOString(),
      data: event.data ?? null,
    })),
  }
}

export async function findOwnedEmail(userId: string, id: string): Promise<EmailRow | null> {
  const [row] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, id), eq(emails.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function setStarred(
  userId: string,
  id: string,
  starred: boolean,
): Promise<EmailListItem | null> {
  const [updated] = await db
    .update(emails)
    .set({ starred, updatedAt: new Date() })
    .where(and(eq(emails.id, id), eq(emails.userId, userId)))
    .returning()
  if (!updated) return null
  return getEmailListItem(updated.id)
}
