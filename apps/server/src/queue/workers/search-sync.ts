import { Worker } from 'bullmq'
import { logger } from '../../lib/logger'
import { indexEmails } from '../../modules/search/sync'
import { createConnection } from '../connection'
import { SEARCH_SYNC_QUEUE, type SearchSyncJobData } from '../queues'

const SYNC_CONCURRENCY = 2

export function startSearchSyncWorker(): Worker<SearchSyncJobData> {
  // BullMQ leaves a connection it was handed alone, so the worker quits its own once closed.
  const connection = createConnection()
  const worker = new Worker<SearchSyncJobData>(
    SEARCH_SYNC_QUEUE,
    async (job) => indexEmails(job.data.emailIds),
    { connection, concurrency: SYNC_CONCURRENCY },
  )
  worker.on('closed', () => {
    void connection.quit()
  })
  worker.on('failed', (job, err) => {
    logger.warn({ err, jobId: job?.id, attempt: job?.attemptsMade }, 'search sync job failed')
  })
  return worker
}
