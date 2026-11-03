import { describe, expect, it } from 'vitest'
import { planSendTimes, summarizePlan } from './planner'

describe('planSendTimes', () => {
  it('spaces sends by delayMs when the hourly limit never binds', () => {
    const times = planSendTimes({ count: 5, startAt: 0, delayMs: 1500, hourlyLimit: 5 })
    expect(times).toEqual([0, 1500, 3000, 4500, 6000])
  })

  it('cuts a window off at the hourly limit and resumes at the next window start', () => {
    const times = planSendTimes({
      count: 5,
      startAt: 0,
      delayMs: 1000,
      hourlyLimit: 3,
      windowMs: 10_000,
    })
    expect(times).toEqual([0, 1000, 2000, 10_000, 11_000])
  })

  it('resets the used count on a window boundary instead of carrying it over', () => {
    // Without the reset, used would still be 2 entering window 1, hitting the
    // limit immediately and pushing the third send out to window 2 (t=20000).
    const times = planSendTimes({
      count: 3,
      startAt: 0,
      delayMs: 6000,
      hourlyLimit: 2,
      windowMs: 10_000,
    })
    expect(times).toEqual([0, 6000, 12_000])
  })

  it('splits 1000 emails at 200/h into exactly 5 windows', () => {
    const times = planSendTimes({ count: 1000, startAt: 0, delayMs: 0, hourlyLimit: 200 })
    const summary = summarizePlan(times)
    expect(summary.windows).toHaveLength(5)
    expect(summary.windows.every((w) => w.count === 200)).toBe(true)
  })

  it('handles a delay longer than the window by jumping straight to the right window', () => {
    const times = planSendTimes({ count: 3, startAt: 0, delayMs: 7_200_000, hourlyLimit: 10 })
    expect(times).toEqual([0, 7_200_000, 14_400_000])
  })
})

describe('summarizePlan', () => {
  it('reports first, last and duration for an empty plan', () => {
    expect(summarizePlan([])).toEqual({ firstAt: null, lastAt: null, durationMs: 0, windows: [] })
  })

  it('reports first, last and duration across windows', () => {
    const times = planSendTimes({
      count: 4,
      startAt: 0,
      delayMs: 1000,
      hourlyLimit: 2,
      windowMs: 5000,
    })
    const summary = summarizePlan(times, 5000)
    expect(summary.firstAt).toBe(times[0])
    expect(summary.lastAt).toBe(times[times.length - 1])
    expect(summary.durationMs).toBe((times[times.length - 1] ?? 0) - (times[0] ?? 0))
  })
})
