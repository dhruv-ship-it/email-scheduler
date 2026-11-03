import type { EmailEventType, EmailStatus } from '@scheduler/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { emailEvents, emails, type EmailRow } from '../../db/schema'
import { db } from '../../lib/db'
import { searchSyncQueue } from '../../queue/queues'

export type TransitionPatch = Partial<
  Pick<
    EmailRow,
    | 'scheduledAt'
    | 'sentAt'
    | 'attempts'
    | 'lastError'
    | 'throttledBy'
    | 'messageId'
    | 'previewUrl'
    | 'starred'
  >
>

export type TransitionEvent = { type: EmailEventType; data?: unknown }

// The single gate every status change goes through (SPEC §4.2). A null return means
// another worker already moved the row; callers treat that as a no-op, and since
// nothing changed there is nothing new to index, so the search-sync job is skipped too.
export async function transition(
  emailId: string,
  from: readonly EmailStatus[],
  to: EmailStatus,
  patch: TransitionPatch = {},
  event?: TransitionEvent,
): Promise<EmailRow | null> {
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(emails)
      .set({
        ...patch,
        status: to,
        throttledBy: to === 'sending' ? null : patch.throttledBy,
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), inArray(emails.status, from)))
      .returning()
    if (!updated) return null
    if (event) {
      await tx.insert(emailEvents).values({ emailId, type: event.type, data: event.data ?? null })
    }
    return updated
  })
  if (row) await searchSyncQueue.add('sync', { emailIds: [emailId] })
  return row
}
