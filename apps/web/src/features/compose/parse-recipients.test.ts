import { describe, expect, it } from 'vitest'
import { parseRecipientSource } from './parse-recipients'

describe('parseRecipientSource', () => {
  it('finds addresses in any column and counts rows that have none', async () => {
    const csv = [
      'name,email,notes',
      'Ada,ada@example.com,first',
      'Bob,,no address',
      'Cy,cy@example.com,',
    ].join('\n')

    const result = await parseRecipientSource(csv)

    expect(result.addresses).toEqual(['ada@example.com', 'cy@example.com'])
    // The header row and Bob's row carry no address.
    expect(result.rowsWithoutEmail).toBe(2)
    expect(result.duplicates).toBe(0)
  })

  it('lowercases and counts repeats as duplicates', async () => {
    const csv = ['Ada@Example.com', 'ada@example.com', 'bob@example.com'].join('\n')

    const result = await parseRecipientSource(csv)

    expect(result.addresses).toEqual(['ada@example.com', 'bob@example.com'])
    expect(result.duplicates).toBe(1)
  })

  it('skips addresses that were already typed in', async () => {
    const result = await parseRecipientSource('typed@example.com\nnew@example.com', [
      'Typed@example.com',
    ])

    expect(result.addresses).toEqual(['new@example.com'])
    expect(result.duplicates).toBe(1)
  })

  it('pulls an address out of a cell that also holds a name', async () => {
    const result = await parseRecipientSource('"Ada Lovelace <ada@example.com>"')

    expect(result.addresses).toEqual(['ada@example.com'])
  })

  it('reads a plain text list with one address per line and ignores blank lines', async () => {
    const result = await parseRecipientSource('a@example.com\n\n\nb@example.com\n')

    expect(result.addresses).toEqual(['a@example.com', 'b@example.com'])
    expect(result.rowsWithoutEmail).toBe(0)
  })

  it('returns nothing for an empty file', async () => {
    const result = await parseRecipientSource('')

    expect(result).toEqual({ addresses: [], duplicates: 0, rowsWithoutEmail: 0 })
  })
})
