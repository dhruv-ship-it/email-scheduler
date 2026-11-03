import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { afterAll } from 'vitest'
import { db, pool } from '../lib/db'
import { createConnection } from '../queue/connection'

const ALREADY_EXISTS = '42P04'

async function ensureTestDatabaseExists(): Promise<void> {
  const target = new URL(process.env.DATABASE_URL as string)
  const databaseName = target.pathname.slice(1)
  const adminUrl = new URL(target)
  adminUrl.pathname = '/postgres'
  const admin = new Pool({ connectionString: adminUrl.toString() })
  try {
    await admin.query(`CREATE DATABASE ${databaseName}`)
  } catch (err) {
    if ((err as { code?: string }).code !== ALREADY_EXISTS) throw err
  } finally {
    await admin.end()
  }
}

await ensureTestDatabaseExists()
await migrate(db, { migrationsFolder: 'drizzle' })

afterAll(async () => {
  await pool.end()
})

export async function cleanDatabase(): Promise<void> {
  await db.execute(
    sql`truncate table email_events, emails, campaigns, senders, slack_connections, users restart identity cascade`,
  )
}

export async function flushTestRedis(): Promise<void> {
  const redis = createConnection()
  await redis.flushdb()
  await redis.quit()
}
