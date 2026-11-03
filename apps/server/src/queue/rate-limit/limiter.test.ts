import { describe, expect, it, vi } from 'vitest'
import type { CampaignRow, SenderRow } from '../../db/schema'

// bucketsFor is pure, but importing the module also opens the rate limiter's redis
// connection as a side effect, which a plain unit test should not need.
vi.mock('../connection', () => ({
  createConnection: () => ({
    defineCommand: () => {},
    quit: () => Promise.resolve(),
  }),
}))

const { bucketsFor } = await import('./limiter')

describe('bucketsFor', () => {
  it('builds sender and campaign buckets from the loaded rows', () => {
    const sender = { id: 's1', hourlyLimit: 42 } as SenderRow
    const campaign = { id: 'c1', hourlyLimit: 7, delayMs: 3000 } as CampaignRow

    expect(bucketsFor({ sender, campaign })).toEqual([
      { kind: 'sender', id: 's1', limit: 42, intervalMs: 2000 },
      { kind: 'campaign', id: 'c1', limit: 7, intervalMs: 3000 },
    ])
  })

  it('falls back to the env default sender limit when none is set', () => {
    const sender = { id: 's1', hourlyLimit: null } as SenderRow
    const campaign = { id: 'c1', hourlyLimit: 10, delayMs: 0 } as CampaignRow

    const buckets = bucketsFor({ sender, campaign })
    expect(buckets[0]).toEqual({ kind: 'sender', id: 's1', limit: 200, intervalMs: 2000 })
  })

  it('leaves out the global bucket when it is disabled', () => {
    const sender = { id: 's1', hourlyLimit: 42 } as SenderRow
    const campaign = { id: 'c1', hourlyLimit: 7, delayMs: 3000 } as CampaignRow

    expect(bucketsFor({ sender, campaign })).toHaveLength(2)
  })
})
