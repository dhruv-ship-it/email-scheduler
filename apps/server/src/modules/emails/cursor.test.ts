import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('cursor', () => {
  it('round-trips a sort value and id', () => {
    const encoded = encodeCursor({ v: '2026-01-02T03:04:05.000Z', id: 'email-1' })
    expect(decodeCursor(encoded)).toEqual({ v: '2026-01-02T03:04:05.000Z', id: 'email-1' })
  })

  it('returns null for a string that is not valid base64url json', () => {
    expect(decodeCursor('not valid base64!!')).toBeNull()
  })

  it('returns null for well-formed json missing the expected fields', () => {
    const encoded = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url')
    expect(decodeCursor(encoded)).toBeNull()
  })

  it('returns null for an encoded json array instead of an object', () => {
    const encoded = Buffer.from(JSON.stringify([1, 2, 3]), 'utf8').toString('base64url')
    expect(decodeCursor(encoded)).toBeNull()
  })
})
