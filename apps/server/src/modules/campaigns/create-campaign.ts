import { randomUUID } from 'node:crypto'
import {
  normalizeRecipients,
  planSendTimes,
  summarizePlan,
  type CreateCampaignInput,
  type CreateCampaignResult,
} from '@scheduler/shared'
import { eq, sql } from 'drizzle-orm'
import { env } from '../../config/env'
import { campaigns, emailEvents, emails, senders } from '../../db/schema'
import { db } from '../../lib/db'
import { ApiError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { emailSendQueue, searchSyncQueue } from '../../queue/queues'
import { sanitizeBody } from './sanitize'

const INSERT_CHUNK_SIZE = 1000
const JOB_CHUNK_SIZE = 500
const ENQUEUE_ATTEMPTS = 3
const ENQUEUE_RETRY_BASE_MS = 500

export type CreateCampaignArgs = CreateCampaignInput & { userId: string }

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetries(fn: () => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= ENQUEUE_ATTEMPTS; attempt++) {
    try {
      await fn()
      return
    } catch (err) {
      if (attempt === ENQUEUE_ATTEMPTS) throw err
      await sleep(ENQUEUE_RETRY_BASE_MS * attempt)
    }
  }
}

async function loadSender(senderId: string): Promise<typeof senders.$inferSelect> {
  const [sender] = await db.select().from(senders).where(eq(senders.id, senderId)).limit(1)
  if (sender) return sender
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(senders)
  if ((row?.count ?? 0) === 0) throw new ApiError('unavailable', 'No senders are set up yet.')
  throw new ApiError('not_found', "That sender doesn't exist.")
}

// Mirrors SPEC §5.1. Used by both POST /api/campaigns and the sample-schedule
// script, so a campaign created from the CLI goes through the exact same rules.
export async function createCampaign(input: CreateCampaignArgs): Promise<CreateCampaignResult> {
  const minDelaySeconds = Math.ceil(env.MIN_SEND_INTERVAL_MS / 1000)
  if (input.delaySeconds < minDelaySeconds) {
    throw new ApiError(
      'validation_failed',
      `The delay between emails must be at least ${minDelaySeconds} seconds.`,
    )
  }

  const { accepted, duplicates, invalid } = normalizeRecipients(input.recipients)
  if (accepted.length === 0) {
    throw new ApiError('validation_failed', 'None of those addresses could be used.')
  }

  const { bodyHtml, bodyText } = sanitizeBody(input.bodyHtml)
  if (bodyText.trim().length === 0) {
    throw new ApiError('validation_failed', 'The email body is empty.')
  }

  const sender = await loadSender(input.senderId)

  const startAt = Math.max(Date.parse(input.startAt), Date.now())
  const delayMs = input.delaySeconds * 1000
  const times = planSendTimes({
    count: accepted.length,
    startAt,
    delayMs,
    hourlyLimit: input.hourlyLimit,
    windowMs: env.RATE_WINDOW_MS,
  })
  const summary = summarizePlan(times, env.RATE_WINDOW_MS)
  const firstAt = summary.firstAt ?? startAt
  const lastAt = summary.lastAt ?? startAt

  const campaignId = randomUUID()
  const emailIds = accepted.map(() => randomUUID())

  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id: campaignId,
      userId: input.userId,
      senderId: sender.id,
      subject: input.subject,
      bodyHtml,
      bodyText,
      startAt: new Date(startAt),
      delayMs,
      hourlyLimit: input.hourlyLimit,
      total: accepted.length,
    })

    const emailRows = accepted.map((recipient, i) => ({
      id: emailIds[i] as string,
      campaignId,
      userId: input.userId,
      senderId: sender.id,
      recipient,
      seq: i,
      status: 'scheduled' as const,
      scheduledAt: new Date(times[i] as number),
      plannedAt: new Date(times[i] as number),
    }))
    for (const batch of chunk(emailRows, INSERT_CHUNK_SIZE)) {
      await tx.insert(emails).values(batch)
    }

    const eventRows = emailIds.map((emailId, i) => ({
      emailId,
      type: 'scheduled' as const,
      data: { plannedAt: new Date(times[i] as number).toISOString() },
    }))
    for (const batch of chunk(eventRows, INSERT_CHUNK_SIZE)) {
      await tx.insert(emailEvents).values(batch)
    }
  })

  let queued = true
  try {
    await withRetries(async () => {
      const sendJobs = emailIds.map((emailId, i) => ({ emailId, at: times[i] as number }))
      for (const batch of chunk(sendJobs, JOB_CHUNK_SIZE)) {
        await emailSendQueue.addBulk(
          batch.map(({ emailId, at }) => ({
            name: 'send',
            data: { emailId },
            opts: { jobId: emailId, delay: Math.max(0, at - Date.now()) },
          })),
        )
      }
      for (const batch of chunk(emailIds, JOB_CHUNK_SIZE)) {
        await searchSyncQueue.add('sync', { emailIds: batch })
      }
    })
  } catch (err) {
    queued = false
    logger.error(
      { err, campaignId },
      'could not enqueue jobs for a new campaign; the boot reconciler will re-add them',
    )
  }

  return {
    campaignId,
    accepted: accepted.length,
    duplicates,
    invalid,
    firstSendAt: new Date(firstAt).toISOString(),
    lastSendAt: new Date(lastAt).toISOString(),
    queued,
  }
}
