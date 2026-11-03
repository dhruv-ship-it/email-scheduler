import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, inArray, or } from 'drizzle-orm'
import { emailEvents, emails } from '../db/schema'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { createConnection } from './connection'
import { emailSendQueue } from './queues'

const LOCK_KEY = 'reconcile:lock'
const LOCK_TTL_MS = 60_000
const PAGE_SIZE = 1000
const PENDING_STATUSES = ['scheduled', 'throttled', 'sending'] as const
// A job in one of these states will never run again, yet its row is still pending.
const DEAD_JOB_STATES = new Set(['completed', 'failed', 'unknown'])

// Deletes the lock only if it is still ours, so a run that outlived its 60s lease
// never removes the lock of the run that took over.
const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`

export type ReconcileResult = { checked: number; readded: number; skipped: boolean }

type PendingRow = { id: string; scheduledAt: Date }

async function reconcilePage(rows: PendingRow[]): Promise<number> {
  const jobs = await Promise.all(rows.map((row) => emailSendQueue.getJob(row.id)))
  const toAdd: PendingRow[] = []

  await Promise.all(
    rows.map(async (row, index) => {
      const job = jobs[index]
      if (!job) {
        toAdd.push(row)
        return
      }
      if (DEAD_JOB_STATES.has(await job.getState())) {
        // The jobId is reused below, so the stale entry has to go first.
        await job.remove()
        toAdd.push(row)
      }
    }),
  )
  if (toAdd.length === 0) return 0

  const nowMs = Date.now()
  await emailSendQueue.addBulk(
    toAdd.map((row) => ({
      name: 'send',
      data: { emailId: row.id },
      opts: { jobId: row.id, delay: Math.max(0, row.scheduledAt.getTime() - nowMs) },
    })),
  )
  await db.insert(emailEvents).values(
    toAdd.map((row) => ({
      emailId: row.id,
      type: 'requeued' as const,
      data: { by: 'reconciler' },
    })),
  )
  return toAdd.length
}

// Rebuilds the queue from Postgres, which is the source of truth: every pending
// row must have a live job. Adding with the row's id as jobId makes a repeat run
// harmless, and the lock keeps several booting workers from all doing the work.
export async function reconcile(): Promise<ReconcileResult> {
  const redis = createConnection()
  const token = randomUUID()
  try {
    const acquired = await redis.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX')
    if (acquired !== 'OK') {
      logger.info('reconcile skipped, another worker holds the lock')
      return { checked: 0, readded: 0, skipped: true }
    }

    const startedAt = Date.now()
    let checked = 0
    let readded = 0
    let cursor: PendingRow | null = null
    try {
      for (;;) {
        const page: PendingRow[] = await db
          .select({ id: emails.id, scheduledAt: emails.scheduledAt })
          .from(emails)
          .where(
            and(
              inArray(emails.status, PENDING_STATUSES),
              cursor
                ? or(
                    gt(emails.scheduledAt, cursor.scheduledAt),
                    and(eq(emails.scheduledAt, cursor.scheduledAt), gt(emails.id, cursor.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(emails.scheduledAt), asc(emails.id))
          .limit(PAGE_SIZE)
        if (page.length === 0) break
        checked += page.length
        readded += await reconcilePage(page)
        cursor = page[page.length - 1] ?? null
        if (page.length < PAGE_SIZE) break
      }
    } finally {
      await redis.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, token)
    }

    logger.info({ checked, readded, tookMs: Date.now() - startedAt }, 'reconcile finished')
    return { checked, readded, skipped: false }
  } finally {
    await redis.quit()
  }
}
