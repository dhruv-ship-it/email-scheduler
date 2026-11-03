import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './lib/db'
import { logger } from './lib/logger'

async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: 'drizzle' })
  logger.info('migrations applied')
}

main()
  .catch((err) => {
    logger.error({ err }, 'migration failed')
    process.exitCode = 1
  })
  .finally(() => {
    void pool.end()
  })
