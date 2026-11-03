import { TERMINAL_EMAIL_STATUSES } from '@scheduler/shared'
import { DelayedError, UnrecoverableError, Worker, type Job } from 'bullmq'
import { eq } from 'drizzle-orm'
import { env } from '../../config/env'
import {
  campaigns,
  emails,
  senders,
  type CampaignRow,
  type EmailRow,
  type SenderRow,
} from '../../db/schema'
import { db } from '../../lib/db'
import { logger } from '../../lib/logger'
import { getPreviewUrl, sendMail } from '../../lib/mailer'
import { isPermanentSmtpError } from '../../lib/smtp-errors'
import { transition } from '../../modules/emails/transition'
import { createConnection } from '../connection'
import {
  bucketsFor,
  claimRateLimitAlert,
  now as reserveNow,
  reserve,
  type Reservation,
} from '../rate-limit/limiter'
import { EMAIL_SEND_QUEUE, notificationsQueue, type EmailSendJobData } from '../queues'

const SEND_BACKOFF_BASE_MS = 15_000
// A reservation this close to now is treated as "now": no point in parking the job
// in the delayed set for a handful of milliseconds just to wake it straight back up.
const RESERVE_NOW_GRACE_MS = 50
// A job can wake up slightly before its reserved time (BullMQ's own timer jitter);
// only push it back out if it is more than this early.
const WAKE_EARLY_GRACE_MS = 1000
const ALERT_TTL_WINDOWS = 2
// BullMQ's default lock is 30s; stated here because the stalled-job recovery in
// SPEC §7.3 depends on it. A job that stalls twice is failed instead of looping.
const LOCK_DURATION_MS = 30_000
const MAX_STALLED_COUNT = 2

// Mirrors BullMQ's own 'exponential' backoff formula; only used to estimate the
// retry event's nextAt for display, since BullMQ schedules the actual retry itself.
function exponentialBackoffMs(attemptsMade: number): number {
  return Math.round(SEND_BACKOFF_BASE_MS * 2 ** Math.max(0, attemptsMade - 1))
}

type LoadedEmail = { email: EmailRow; campaign: CampaignRow; sender: SenderRow }

async function loadEmailForSend(emailId: string): Promise<LoadedEmail | null> {
  const [row] = await db
    .select({ email: emails, campaign: campaigns, sender: senders })
    .from(emails)
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .where(eq(emails.id, emailId))
    .limit(1)
  return row ?? null
}

// Only alerts for the sender and global buckets (SPEC §9.6): a campaign deferral is
// pacing the user set themselves, so it stays silent and just shows as throttled.
async function maybeAlertSlack(loaded: LoadedEmail, reservation: Reservation): Promise<void> {
  const bucket = reservation.bucket
  if (!bucket) return
  const windowIndex = Math.floor(reservation.at / env.RATE_WINDOW_MS)
  const windowStart = windowIndex * env.RATE_WINDOW_MS
  const dedupeKey = `slack:alerted:${loaded.email.userId}:${loaded.sender.id}:${windowIndex}`
  const ttlSeconds = Math.ceil((env.RATE_WINDOW_MS * ALERT_TTL_WINDOWS) / 1000)
  const claimed = await claimRateLimitAlert(dedupeKey, ttlSeconds)
  if (!claimed) return
  await notificationsQueue.add(
    'rate-limit',
    {
      kind: 'rate-limit',
      userId: loaded.email.userId,
      senderId: loaded.sender.id,
      campaignId: loaded.campaign.id,
      windowStart,
      limit: bucket.limit,
      deferredUntil: reservation.at,
    },
    { jobId: `rl-${loaded.email.userId}-${loaded.sender.id}-${windowStart}` },
  )
}

async function processSendJob(job: Job<EmailSendJobData>, token?: string): Promise<void> {
  const { emailId } = job.data
  const loaded = await loadEmailForSend(emailId)
  if (!loaded) {
    logger.warn({ emailId }, 'email row not found for a send job')
    return
  }
  const { email, campaign, sender } = loaded
  if ((TERMINAL_EMAIL_STATUSES as readonly string[]).includes(email.status)) return

  const nowMs = await reserveNow()
  const reservedAt = job.data.reservedAt ?? null

  if (reservedAt === null) {
    const reservation = await reserve(bucketsFor(loaded))
    if (reservation.at > nowMs + RESERVE_NOW_GRACE_MS) {
      await job.updateData({ ...job.data, reservedAt: reservation.at })
      if (reservation.reason === 'hourly' && reservation.bucket) {
        await transition(
          emailId,
          ['scheduled', 'throttled'],
          'throttled',
          { scheduledAt: new Date(reservation.at), throttledBy: reservation.bucket.kind },
          {
            type: 'deferred',
            data: {
              reason: 'hourly',
              bucket: reservation.bucket.kind,
              limit: reservation.bucket.limit,
              until: reservation.at,
            },
          },
        )
        if (reservation.bucket.kind === 'sender' || reservation.bucket.kind === 'global') {
          await maybeAlertSlack(loaded, reservation)
        }
      } else {
        await transition(emailId, ['scheduled', 'throttled'], email.status, {
          scheduledAt: new Date(reservation.at),
        })
      }
      await job.moveToDelayed(reservation.at, token)
      throw new DelayedError()
    }
  } else if (reservedAt > nowMs + WAKE_EARLY_GRACE_MS) {
    await job.moveToDelayed(reservedAt, token)
    throw new DelayedError()
  }
  // The slot is used now; if this send fails and retries, it reserves a fresh one.
  if (reservedAt !== null) await job.updateData({ ...job.data, reservedAt: null })

  const attempt = email.attempts + 1
  const claimed = await transition(
    emailId,
    ['scheduled', 'throttled', 'sending'],
    'sending',
    { attempts: attempt },
    { type: 'sending', data: { attempt } },
  )
  if (!claimed) return

  try {
    const info = await sendMail(sender, {
      from: `"${sender.name}" <${sender.email}>`,
      to: claimed.recipient,
      subject: campaign.subject,
      text: campaign.bodyText,
      html: campaign.bodyHtml,
      messageId: `<${emailId}@scheduler.local>`,
      headers: { 'X-Campaign-Id': campaign.id, 'X-Email-Id': emailId },
    })
    const previewUrl = getPreviewUrl(info)
    const messageId =
      typeof info.messageId === 'string' ? info.messageId : `<${emailId}@scheduler.local>`
    await transition(
      emailId,
      ['sending'],
      'sent',
      { sentAt: new Date(), messageId, previewUrl, lastError: null },
      { type: 'sent', data: { messageId, previewUrl } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const permanent = isPermanentSmtpError(err)
    const maxAttempts = job.opts.attempts ?? env.SEND_MAX_ATTEMPTS
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts

    if (permanent || isLastAttempt) {
      await transition(
        emailId,
        ['sending'],
        'failed',
        { lastError: message },
        { type: 'failed', data: { error: message, permanent } },
      )
      if (permanent) throw new UnrecoverableError(message)
      throw err
    }

    const nextAt = Date.now() + exponentialBackoffMs(job.attemptsMade + 1)
    await transition(
      emailId,
      ['sending'],
      'scheduled',
      { lastError: message, scheduledAt: new Date(nextAt) },
      { type: 'retry', data: { attempt, error: message, nextAt } },
    )
    throw err
  }
}

export function startSendWorker(): Worker<EmailSendJobData> {
  // BullMQ leaves a connection it was handed alone, so the worker quits its own once closed.
  const connection = createConnection()
  const worker = new Worker<EmailSendJobData>(EMAIL_SEND_QUEUE, processSendJob, {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: LOCK_DURATION_MS,
    maxStalledCount: MAX_STALLED_COUNT,
  })
  worker.on('closed', () => {
    void connection.quit()
  })
  worker.on('failed', (job, err) => {
    logger.error(
      { err, jobId: job?.id, emailId: job?.data.emailId, attempt: job?.attemptsMade },
      'send job failed',
    )
  })
  return worker
}
