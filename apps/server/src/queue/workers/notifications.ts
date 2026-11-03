import { UnrecoverableError, Worker, type Job } from 'bullmq'
import { eq } from 'drizzle-orm'
import { env } from '../../config/env'
import { campaigns, senders } from '../../db/schema'
import { db } from '../../lib/db'
import { decrypt } from '../../lib/crypto'
import { logger } from '../../lib/logger'
import { deleteConnection, findConnection } from '../../modules/slack/connection'
import { rateLimitMessage } from '../../modules/slack/messages'
import { postToWebhook } from '../../modules/slack/webhook'
import { createConnection } from '../connection'
import { NOTIFICATIONS_QUEUE, type NotificationJobData } from '../queues'

export async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const data = job.data

  // Connecting or disconnecting takes effect immediately because the connection is read
  // here, at send time, rather than when the alert was queued.
  const connection = await findConnection(data.userId)
  if (!connection) {
    logger.debug({ userId: data.userId }, 'no slack connection, skipping the alert')
    return
  }

  const [sender] = await db.select().from(senders).where(eq(senders.id, data.senderId)).limit(1)
  const [campaign] = await db
    .select({ subject: campaigns.subject })
    .from(campaigns)
    .where(eq(campaigns.id, data.campaignId))
    .limit(1)
  if (!sender || !campaign) {
    logger.warn({ senderId: data.senderId, campaignId: data.campaignId }, 'alert has no sender')
    return
  }

  const result = await postToWebhook(
    decrypt(connection.webhookUrlEnc),
    rateLimitMessage({
      senderName: sender.name,
      senderEmail: sender.email,
      limit: data.limit,
      windowStart: data.windowStart,
      windowMs: env.RATE_WINDOW_MS,
      deferredUntil: data.deferredUntil,
      subject: campaign.subject,
    }),
  )

  switch (result.kind) {
    case 'ok':
      return
    case 'revoked':
      // The webhook is gone for good, so drop the connection and stop: retrying
      // would only fail the same way.
      await deleteConnection(data.userId)
      logger.info({ userId: data.userId }, 'slack webhook was revoked, connection removed')
      throw new UnrecoverableError('The Slack webhook was revoked.')
    case 'retry':
      throw new Error(result.reason)
    case 'rejected':
      logger.warn({ reason: result.reason }, 'slack rejected the alert')
      throw new UnrecoverableError(result.reason)
  }
}

export function startNotificationsWorker(): Worker<NotificationJobData> {
  // BullMQ leaves a connection it was handed alone, so the worker quits its own once closed.
  const connection = createConnection()
  const worker = new Worker<NotificationJobData>(NOTIFICATIONS_QUEUE, processNotification, {
    connection,
  })
  worker.on('closed', () => {
    void connection.quit()
  })
  worker.on('failed', (job, err) => {
    logger.warn({ err, jobId: job?.id, attempt: job?.attemptsMade }, 'slack alert job failed')
  })
  return worker
}
