import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { env } from '../config/env'
import { createConnection } from '../queue/connection'
import { RESERVE_SLOT_LUA } from '../queue/rate-limit/reserve-slot'

type Args = { count: number; connections: number; limit: number; intervalMs: number }

function parseArgs(argv: string[]): Args {
  const args: Args = { count: 1000, connections: 10, limit: 200, intervalMs: 0 }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) continue
    if (flag === '--mode') {
      if (value !== 'reserve') throw new Error('Only --mode reserve is available.')
    } else if (flag === '--count') args.count = Number(value)
    else if (flag === '--connections') args.connections = Number(value)
    else if (flag === '--limit') args.limit = Number(value)
    else if (flag === '--interval') args.intervalMs = Number(value)
    else continue
    i++
  }
  for (const [name, value] of Object.entries(args)) {
    if (!Number.isInteger(value) || value < (name === 'intervalMs' ? 0 : 1)) {
      throw new Error(`--${name === 'intervalMs' ? 'interval' : name} needs a whole number.`)
    }
  }
  return args
}

function utc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const windowMs = env.RATE_WINDOW_MS
  const bucketId = `loadtest-${randomUUID()}`
  const cursorKey = `rl:sender:${bucketId}:cursor`
  const windowPrefix = `rl:sender:${bucketId}:w:`

  const connections = Array.from({ length: args.connections }, () => {
    const redis = createConnection()
    redis.defineCommand('reserveSlot', { lua: RESERVE_SLOT_LUA })
    return redis
  })

  const completed: number[] = []
  const share = Math.floor(args.count / args.connections)
  const extra = args.count % args.connections
  const startedAt = performance.now()
  try {
    // Each connection keeps one reservation in flight, so `connections` of them race
    // inside Redis at any moment, the way several worker processes would.
    await Promise.all(
      connections.map(async (redis, index) => {
        const turns = share + (index < extra ? 1 : 0)
        for (let turn = 0; turn < turns; turn++) {
          const [at] = await redis.reserveSlot(
            2,
            cursorKey,
            windowPrefix,
            windowMs,
            1,
            args.limit,
            args.intervalMs,
          )
          completed.push(Number(at))
        }
      }),
    )
    const elapsedMs = Math.round(performance.now() - startedAt)

    const perWindow = new Map<number, number>()
    for (const at of completed) {
      const start = Math.floor(at / windowMs) * windowMs
      perWindow.set(start, (perWindow.get(start) ?? 0) + 1)
    }
    const windows = [...perWindow.entries()].sort(([a], [b]) => a - b)
    const maxPerWindow = Math.max(...windows.map(([, reserved]) => reserved))
    const distinct = new Set(completed).size
    const sameSlot = completed.length - distinct
    // Order in which the results came back; a slot earlier than the one before it
    // means two reservations finished out of order across connections.
    let inversions = 0
    for (let i = 1; i < completed.length; i++) {
      if ((completed[i] as number) < (completed[i - 1] as number)) inversions += 1
    }

    const lines = [
      `reservations ${args.count}, connections ${args.connections}, limit ${args.limit} per window, interval ${args.intervalMs} ms, window ${windowMs} ms`,
      '',
      `${'window start'.padEnd(22)}${'reserved'.padStart(10)}${'limit'.padStart(8)}`,
      ...windows.map(
        ([start, reserved]) =>
          `${utc(start).padEnd(22)}${String(reserved).padStart(10)}${String(args.limit).padStart(8)}`,
      ),
      '',
      `max per window <= limit: ${maxPerWindow <= args.limit ? 'ok' : 'FAILED'} (max ${maxPerWindow})`,
      args.intervalMs > 0
        ? `duplicate slots: ${sameSlot} (${sameSlot === 0 ? 'ok' : 'FAILED'})`
        : `same-millisecond slots: ${sameSlot} (allowed with interval 0)`,
      `order inversions: ${inversions}`,
      `elapsed: ${elapsedMs} ms`,
    ]
    process.stdout.write(`${lines.join('\n')}\n`)

    if (maxPerWindow > args.limit || (args.intervalMs > 0 && sameSlot > 0)) {
      process.exitCode = 1
    }
  } finally {
    // The test buckets are removed so repeated runs leave Redis as they found it.
    const cleaner = connections[0]
    if (cleaner) {
      const windowKeys = [...new Set(completed.map((at) => Math.floor(at / windowMs)))].map(
        (w) => `${windowPrefix}${w}`,
      )
      await cleaner.del(cursorKey, ...windowKeys)
    }
    await Promise.all(connections.map((redis) => redis.quit()))
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
