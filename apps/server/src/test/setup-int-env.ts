// No app imports here on purpose: ESM hoists imports above a module's own top-level
// code, so a file that both mutates process.env and imports app modules would have
// those modules read the *old* env before this file's own assignment ever ran.
// This file only mutates process.env, and runs as the first vitest setup file so
// everything imported afterward (config/env.ts, lib/db.ts, queue/connection.ts)
// sees the test database and the isolated Redis db from the start.
function withPath(url: string, path: string): string {
  const parsed = new URL(url)
  parsed.pathname = path
  return parsed.toString()
}

process.env.DATABASE_URL = withPath(
  process.env.DATABASE_URL ?? 'postgres://scheduler:scheduler@localhost:5432/scheduler',
  '/scheduler_test',
)
process.env.REDIS_URL = withPath(process.env.REDIS_URL ?? 'redis://localhost:6379', '/15')
// No integration test should ever reach real Ethereal SMTP.
process.env.MAIL_TRANSPORT = 'json'
