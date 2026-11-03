import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from './crypto'

describe('crypto', () => {
  it('round-trips a plaintext string', () => {
    const encrypted = encrypt('super secret smtp password')
    expect(decrypt(encrypted)).toBe('super secret smtp password')
  })

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = encrypt('hello world')
    const parts = encrypted.split('.')
    const iv = parts[0]
    const tag = parts[1]
    const data = parts[2]
    if (iv === undefined || tag === undefined || data === undefined) {
      throw new Error('unexpected ciphertext format')
    }
    const tamperedData = Buffer.from(data, 'base64')
    tamperedData[0] = (tamperedData[0] ?? 0) ^ 0xff
    const tampered = [iv, tag, tamperedData.toString('base64')].join('.')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when decrypted with the wrong key', () => {
    const encrypted = encrypt('hello world')
    expect(() => decrypt(encrypted, randomBytes(32))).toThrow()
  })
})
