import type { Result } from 'ioredis'
import { env } from '../../config/env'
import type { CampaignRow, SenderRow } from '../../db/schema'
import { createConnection } from '../connection'
import { RESERVE_SLOT_LUA } from './reserve-slot'

export type BucketKind = 'sender' | 'campaign' | 'global'
export type Bucket = { kind: BucketKind; id: string; limit: number; intervalMs: number }
export type ReserveReason = 'now' | 'pacing' | 'hourly'
export type Reservation = { at: number; reason: ReserveReason; bucket: Bucket | null }

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveSlot(...args: (string | number)[]): Result<[number, ReserveReason, number], Context>
  }
}

// No numberOfKeys is fixed on this command (SPEC §6.3): the number of buckets varies
// per call, so every caller passes the key count as the first argument itself.
const redis = createConnection()
redis.defineCommand('reserveSlot', { lua: RESERVE_SLOT_LUA })

function bucketLabel(bucket: Bucket): string {
  return bucket.kind === 'global' ? 'global' : `${bucket.kind}:${bucket.id}`
}

function bucketKeys(bucket: Bucket): [cursor: string, countPrefix: string] {
  const label = bucketLabel(bucket)
  return [`rl:${label}:cursor`, `rl:${label}:w:`]
}

export async function now(): Promise<number> {
  const [seconds, micros] = await redis.time()
  return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000)
}

export async function reserve(
  buckets: readonly Bucket[],
  windowMs: number = env.RATE_WINDOW_MS,
): Promise<Reservation> {
  if (buckets.length === 0) throw new Error('reserve needs at least one bucket')
  const keys = buckets.flatMap(bucketKeys)
  const argv: (string | number)[] = [windowMs, buckets.length]
  for (const bucket of buckets) argv.push(bucket.limit, bucket.intervalMs)
  const [at, reason, pushedByIndex] = await redis.reserveSlot(keys.length, ...keys, ...argv)
  return {
    at,
    reason,
    bucket: pushedByIndex > 0 ? (buckets[pushedByIndex - 1] ?? null) : null,
  }
}

// One alert per user, sender and window (SPEC §9.6), no matter how many deferred
// jobs land on the same window behind the first one that trips the cap.
export async function claimRateLimitAlert(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
  return result === 'OK'
}

export function bucketsFor(loaded: { sender: SenderRow; campaign: CampaignRow }): Bucket[] {
  const buckets: Bucket[] = [
    {
      kind: 'sender',
      id: loaded.sender.id,
      limit: loaded.sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      intervalMs: env.MIN_SEND_INTERVAL_MS,
    },
    {
      kind: 'campaign',
      id: loaded.campaign.id,
      limit: loaded.campaign.hourlyLimit,
      intervalMs: loaded.campaign.delayMs,
    },
  ]
  if (env.MAX_EMAILS_PER_HOUR_GLOBAL > 0) {
    buckets.push({
      kind: 'global',
      id: 'global',
      limit: env.MAX_EMAILS_PER_HOUR_GLOBAL,
      intervalMs: 0,
    })
  }
  return buckets
}

export async function closeLimiter(): Promise<void> {
  await redis.quit()
}
