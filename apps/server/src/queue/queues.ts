import { Queue } from 'bullmq'
import { env } from '../config/env'
import { createConnection } from './connection'

export const EMAIL_SEND_QUEUE = 'email-send'
export const SEARCH_SYNC_QUEUE = 'search-sync'
export const NOTIFICATIONS_QUEUE = 'notifications'

export type EmailSendJobData = { emailId: string; reservedAt?: number | null }
export type SearchSyncJobData = { emailIds: string[] }
export type NotificationJobData = {
  kind: 'rate-limit'
  userId: string
  senderId: string
  campaignId: string
  windowStart: number
  limit: number
  deferredUntil: number
}

// BullMQ leaves a connection alone when it is handed an instance, so the queues
// share these and closeQueues quits them; otherwise one-shot scripts never exit.
const connections = [createConnection(), createConnection(), createConnection()] as const

export const emailSendQueue = new Queue<EmailSendJobData>(EMAIL_SEND_QUEUE, {
  connection: connections[0],
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 15_000 },
    removeOnComplete: { age: 86_400, count: 5000 },
    removeOnFail: { age: 604_800 },
  },
})

export const searchSyncQueue = new Queue<SearchSyncJobData>(SEARCH_SYNC_QUEUE, {
  connection: connections[1],
  defaultJobOptions: {
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
  },
})

export const notificationsQueue = new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
  connection: connections[2],
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
  },
})

export async function closeQueues(): Promise<void> {
  await Promise.all([emailSendQueue.close(), searchSyncQueue.close(), notificationsQueue.close()])
  await Promise.all(connections.map((connection) => connection.quit()))
}
