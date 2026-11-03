import { describe, expect, it } from 'vitest'
import { extractEmails, normalizeRecipients } from './recipients'

describe('normalizeRecipients', () => {
  it('dedupes case-insensitively, keeping the first-seen form and order', () => {
    const result = normalizeRecipients(['Foo@Example.com', ' foo@example.com ', 'bar@example.com'])
    expect(result.accepted).toEqual(['foo@example.com', 'bar@example.com'])
    expect(result.duplicates).toBe(1)
    expect(result.invalid).toBe(0)
  })

  it('counts junk entries as invalid instead of accepting them', () => {
    const result = normalizeRecipients(['not-an-email', '', 'bar@example.com', 'also bad'])
    expect(result.accepted).toEqual(['bar@example.com'])
    expect(result.invalid).toBe(3)
    expect(result.duplicates).toBe(0)
  })

  it('returns everything accepted when the list has no issues', () => {
    const result = normalizeRecipients(['a@example.com', 'b@example.com'])
    expect(result).toEqual({
      accepted: ['a@example.com', 'b@example.com'],
      duplicates: 0,
      invalid: 0,
    })
  })
})

describe('extractEmails', () => {
  it('pulls an address out of a cell with a name around it', () => {
    expect(extractEmails('John Doe <John@Example.com> (lead)')).toEqual(['john@example.com'])
  })

  it('finds every address in a cell that has more than one', () => {
    expect(extractEmails('a@example.com; b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ])
  })

  it('returns nothing for a junk cell with no email in it', () => {
    expect(extractEmails('not an address')).toEqual([])
  })

  it('finds addresses across a block of csv-style rows', () => {
    const csvChunk = 'name,email\nJane,jane@example.com\nJohn,john@example.com\n'
    expect(extractEmails(csvChunk)).toEqual(['jane@example.com', 'john@example.com'])
  })
})
