import { randomUUID } from 'node:crypto'
import type { Redis } from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { createConnection } from '../connection'
import { RESERVE_SLOT_LUA } from './reserve-slot'
import { reserve, type Bucket, type ReserveReason } from './limiter'

// Large on purpose: these tests never wait for a window to actually arrive, they
// only check the reserved timestamps, so a small window would risk a real
// wall-clock boundary landing mid-test and making a run flaky.
const WINDOW_MS = 3_600_000

function senderBucket(limit: number, intervalMs = 0): Bucket {
  return { kind: 'sender', id: randomUUID(), limit, intervalMs }
}

function bucketKeys(bucket: Bucket): [string, string] {
  const label = bucket.kind === 'global' ? 'global' : `${bucket.kind}:${bucket.id}`
  return [`rl:${label}:cursor`, `rl:${label}:w:`]
}

// Calls the raw Lua on a caller-supplied connection, bypassing the module's own
// singleton client, so the concurrency test exercises several real ioredis sockets
// the way several worker processes would, instead of one connection's call queue.
async function reserveOn(
  redis: Redis,
  bucket: Bucket,
  windowMs: number,
): Promise<{ at: number; reason: ReserveReason }> {
  const keys = bucketKeys(bucket)
  const [at, reason] = (await redis.eval(
    RESERVE_SLOT_LUA,
    keys.length,
    ...keys,
    windowMs,
    1,
    bucket.limit,
    bucket.intervalMs,
  )) as [number, ReserveReason, number]
  return { at, reason }
}

describe('rate limit reservation', () => {
  afterAll(async () => {
    const redis = createConnection()
    await redis.flushdb()
    await redis.quit()
  })

  it('never lets concurrent connections overbook a window', async () => {
    const bucket = senderBucket(50)
    const connections = Array.from({ length: 6 }, () => createConnection())
    try {
      const reservations = await Promise.all(
        Array.from({ length: 300 }, (_, i) => {
          const connection = connections[i % connections.length] as Redis
          return reserveOn(connection, bucket, WINDOW_MS)
        }),
      )
      const byWindow = new Map<number, number>()
      for (const r of reservations) {
        const w = Math.floor(r.at / WINDOW_MS)
        byWindow.set(w, (byWindow.get(w) ?? 0) + 1)
      }
      const counts = [...byWindow.values()]
      expect(counts.every((count) => count <= 50)).toBe(true)
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(300)
      expect(byWindow.size).toBe(6)
    } finally {
      await Promise.all(connections.map((c) => c.quit()))
    }
  })

  it('spaces consecutive reservations by at least the pacing interval', async () => {
    const bucket = senderBucket(1_000_000, 1000)
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const r = await reserve([bucket], WINDOW_MS)
      times.push(r.at)
    }
    for (let i = 1; i < times.length; i++) {
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(1000)
    }
  })

  it('lets the lower of two bucket limits decide the push', async () => {
    const sender: Bucket = { kind: 'sender', id: randomUUID(), limit: 100, intervalMs: 0 }
    const campaign: Bucket = { kind: 'campaign', id: randomUUID(), limit: 2, intervalMs: 0 }

    const first = await reserve([sender, campaign], WINDOW_MS)
    const second = await reserve([sender, campaign], WINDOW_MS)
    const third = await reserve([sender, campaign], WINDOW_MS)

    expect(first.reason).toBe('now')
    expect(second.reason).toBe('now')
    expect(third.reason).toBe('hourly')
    expect(third.bucket?.kind).toBe('campaign')
    expect(Math.floor(third.at / WINDOW_MS)).toBeGreaterThan(Math.floor(first.at / WINDOW_MS))
  })

  it('spills a backlog across consecutive windows once one fills up', async () => {
    const bucket = senderBucket(50)
    const reservations: { at: number; reason: ReserveReason }[] = []
    for (let i = 0; i < 120; i++) {
      reservations.push(await reserve([bucket], WINDOW_MS))
    }
    const byWindow = new Map<number, number>()
    for (const r of reservations) {
      const w = Math.floor(r.at / WINDOW_MS)
      byWindow.set(w, (byWindow.get(w) ?? 0) + 1)
    }
    const windows = [...byWindow.keys()].sort((a, b) => a - b)
    expect(windows).toHaveLength(3)
    expect(byWindow.get(windows[0] as number)).toBe(50)
    expect(byWindow.get(windows[1] as number)).toBe(50)
    expect(byWindow.get(windows[2] as number)).toBe(20)
    // Every one of the 70 overflow reservations is pushed by the cap, not just the
    // first one into each new window: each still finds its own window full.
    expect(reservations.filter((r) => r.reason === 'hourly')).toHaveLength(70)
  })
})
