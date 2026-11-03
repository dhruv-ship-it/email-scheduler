// Windows are fixed and aligned to the epoch (UTC hours by default), matching the
// runtime limiter in the server so a plan preview and the real send times agree.
export function planSendTimes(o: {
  count: number
  startAt: number
  delayMs: number
  hourlyLimit: number
  windowMs?: number
}): number[] {
  const W = o.windowMs ?? 3_600_000
  const out: number[] = []
  let t = o.startAt
  let w = Math.floor(t / W)
  let used = 0
  for (let i = 0; i < o.count; i++) {
    const wi = Math.floor(t / W)
    if (wi !== w) {
      w = wi
      used = 0
    }
    if (used >= o.hourlyLimit) {
      w += 1
      t = w * W
      used = 0
    }
    out.push(t)
    used += 1
    t += o.delayMs
  }
  return out
}

export type PlanSummary = {
  firstAt: number | null
  lastAt: number | null
  durationMs: number
  windows: { start: number; count: number }[]
}

export function summarizePlan(times: number[], windowMs = 3_600_000): PlanSummary {
  const windows: { start: number; count: number }[] = []
  for (const t of times) {
    const start = Math.floor(t / windowMs) * windowMs
    const current = windows[windows.length - 1]
    if (current && current.start === start) {
      current.count += 1
    } else {
      windows.push({ start, count: 1 })
    }
  }
  const firstAt = times[0] ?? null
  const lastAt = times[times.length - 1] ?? null
  return {
    firstAt,
    lastAt,
    durationMs: firstAt !== null && lastAt !== null ? lastAt - firstAt : 0,
    windows,
  }
}
