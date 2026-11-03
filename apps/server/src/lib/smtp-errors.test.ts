import { describe, expect, it } from 'vitest'
import { isPermanentSmtpError } from './smtp-errors'

describe('isPermanentSmtpError', () => {
  it('treats a 5xx response code as permanent', () => {
    expect(isPermanentSmtpError({ responseCode: 550 })).toBe(true)
  })

  it('treats an envelope error as permanent', () => {
    expect(isPermanentSmtpError({ code: 'EENVELOPE' })).toBe(true)
  })

  it('treats a 4xx response code as temporary', () => {
    expect(isPermanentSmtpError({ responseCode: 450 })).toBe(false)
  })

  it('treats a connection error as temporary', () => {
    expect(isPermanentSmtpError({ code: 'ECONNECTION' })).toBe(false)
  })

  it('handles non-error values without throwing', () => {
    expect(isPermanentSmtpError(undefined)).toBe(false)
    expect(isPermanentSmtpError('plain string')).toBe(false)
  })
})
