import { pool } from '../lib/db'
import { logger } from '../lib/logger'
import { reconcile } from '../queue/reconcile'
import { closeQueues } from '../queue/queues'

reconcile()
  .catch((err) => {
    logger.error({ err }, 'reconcile failed')
    process.exitCode = 1
  })
  .finally(async () => {
    await closeQueues()
    await pool.end()
  })
