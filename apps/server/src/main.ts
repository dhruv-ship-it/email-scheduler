import { env } from './config/env'
import { createApp } from './http/app'
import { pool } from './lib/db'
import { logger } from './lib/logger'
import { esClient } from './modules/search/client'
import { ensureIndexWithRetry } from './modules/search/ensure-index'
import { provisionEtherealSenders } from './modules/senders/provision'
import { closeLimiter } from './queue/rate-limit/limiter'
import { closeQueues } from './queue/queues'
import { reconcile } from './queue/reconcile'
import { startNotificationsWorker } from './queue/workers/notifications'
import { startSearchSyncWorker } from './queue/workers/search-sync'
import { startSendWorker } from './queue/workers/send'

const SHUTDOWN_DEADLINE_MS = 25_000

type Closer = { name: string; close: () => Promise<void> }

// Both roles reach the queues (the api adds jobs, the worker processes them), and
// importing http/app.ts already created their connections, so this always applies.
// Importing the send worker module also opens the rate limiter's own connection,
// regardless of role, for the same reason. Shutdown runs this list in reverse, so the
// pool goes first in the list to be the last thing closed.
const closers: Closer[] = [
  { name: 'postgres', close: () => pool.end() },
  { name: 'elasticsearch', close: () => esClient.close() },
  { name: 'queues', close: closeQueues },
  { name: 'rate-limiter', close: closeLimiter },
]

async function startApi(): Promise<void> {
  await provisionEtherealSenders()
  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, appUrl: env.APP_URL }, 'api listening')
  })
  closers.push({
    name: 'http',
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  })
}

function startWorker(): void {
  logger.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
      senderHourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      globalHourlyLimit: env.MAX_EMAILS_PER_HOUR_GLOBAL,
      rateWindowMs: env.RATE_WINDOW_MS,
      maxAttempts: env.SEND_MAX_ATTEMPTS,
      mailTransport: env.MAIL_TRANSPORT,
    },
    'worker started',
  )
  const sendWorker = startSendWorker()
  closers.push({ name: 'send-worker', close: () => sendWorker.close() })
  const syncWorker = startSearchSyncWorker()
  closers.push({ name: 'search-sync-worker', close: () => syncWorker.close() })
  const notificationsWorker = startNotificationsWorker()
  closers.push({ name: 'notifications-worker', close: () => notificationsWorker.close() })
  // Runs alongside the worker: re-adding is idempotent, so a job picked up by the
  // worker in the meantime is simply found to exist.
  void reconcile().catch((err) => logger.error({ err }, 'reconcile failed'))
}

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')

  const deadline = setTimeout(() => {
    logger.error({ afterMs: SHUTDOWN_DEADLINE_MS }, 'shutdown is taking too long, exiting now')
    process.exit(1)
  }, SHUTDOWN_DEADLINE_MS)

  for (const closer of closers.reverse()) {
    try {
      await closer.close()
    } catch (err) {
      logger.error({ err, step: closer.name }, 'shutdown step failed')
    }
  }

  clearTimeout(deadline)
  logger.info('shutdown complete')
  process.exit(0)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection')
})

// Both roles make sure the index exists; whichever boots first creates it.
void ensureIndexWithRetry()
if (env.ROLE === 'api' || env.ROLE === 'all') void startApi()
if (env.ROLE === 'worker' || env.ROLE === 'all') startWorker()
