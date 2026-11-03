import { describe, expect, it } from 'vitest'
import { roleOverride } from './env'

describe('roleOverride', () => {
  it('reads main.ts role switch from argv[2]', () => {
    expect(roleOverride(['node', 'main.js', 'worker'])).toBe('worker')
  })

  it('ignores a script with its own flags in that position', () => {
    expect(roleOverride(['node', 'create-senders.js', '--count', '2'])).toBeUndefined()
  })

  it('returns undefined with no extra argv at all', () => {
    expect(roleOverride(['node', 'main.js'])).toBeUndefined()
  })
})
