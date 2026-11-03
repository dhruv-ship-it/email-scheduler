import { describe, expect, it } from 'vitest'
import {
  EMAIL_STATUSES,
  EMAIL_TABS,
  TAB_DEFAULT_STATUSES,
  TAB_FILTER_STATUSES,
  tabForStatus,
} from './email-status'

describe('tab to status mapping', () => {
  it('reaches every status through some tab filter', () => {
    const covered = new Set(EMAIL_TABS.flatMap((tab) => [...TAB_FILTER_STATUSES[tab]]))
    expect([...EMAIL_STATUSES].filter((s) => !covered.has(s))).toEqual([])
  })

  it('never lists one status under two tabs', () => {
    const scheduled = new Set(TAB_FILTER_STATUSES.scheduled)
    expect(TAB_FILTER_STATUSES.sent.filter((s) => scheduled.has(s))).toEqual([])
  })

  it('leaves cancelled out of the default sent list', () => {
    expect(TAB_DEFAULT_STATUSES.sent).not.toContain('cancelled')
    expect(TAB_FILTER_STATUSES.sent).toContain('cancelled')
  })

  it('routes a status back to its tab', () => {
    expect(tabForStatus('throttled')).toBe('scheduled')
    expect(tabForStatus('cancelled')).toBe('sent')
  })
})
