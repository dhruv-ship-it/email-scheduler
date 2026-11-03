import IORedis, { type Redis } from 'ioredis'
import { env } from '../config/env'

// BullMQ needs this on every connection it owns, not only on workers: it issues
// blocking commands internally and otherwise ioredis can give up retrying mid-job.
export function createConnection(): Redis {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
}
