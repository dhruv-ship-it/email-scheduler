import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { env } from '../../config/env'
import { signSession, verifySession } from '../auth/session'
import { signSlackState, verifySlackState } from './state'

const USER_ID = '8f4e1c0a-1111-4222-8333-444455556666'

describe('slack oauth state', () => {
  it('round-trips the user id', async () => {
    const state = await signSlackState(USER_ID)

    await expect(verifySlackState(state)).resolves.toBe(USER_ID)
  })

  it('rejects a state whose signature was altered', async () => {
    const state = await signSlackState(USER_ID)
    // The first signature character carries all six bits; the last one carries only
    // four, so changing it can leave the decoded bytes, and the signature, unchanged.
    const [header, payload, signature = ''] = state.split('.')
    const flipped = signature.startsWith('A') ? 'B' : 'A'
    const tampered = `${header}.${payload}.${flipped}${signature.slice(1)}`

    await expect(verifySlackState(tampered)).rejects.toThrow()
  })

  it('rejects a state whose payload was swapped for another user', async () => {
    const state = await signSlackState(USER_ID)
    const [header, , signature] = state.split('.')
    const forged = Buffer.from(
      JSON.stringify({ sub: 'someone-else', aud: 'slack-oauth', exp: 4102444800 }),
    ).toString('base64url')

    await expect(verifySlackState(`${header}.${forged}.${signature}`)).rejects.toThrow()
  })

  it('rejects an expired state', async () => {
    const state = await signSlackState(USER_ID, -60)

    await expect(verifySlackState(state)).rejects.toThrow()
  })

  it('rejects a session token, which has no audience', async () => {
    const session = await signSession(USER_ID)

    await expect(verifySlackState(session)).rejects.toThrow()
  })

  it('rejects a token signed for another audience', async () => {
    const other = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setAudience('something-else')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(env.SESSION_SECRET))

    await expect(verifySlackState(other)).rejects.toThrow()
  })

  it('is never accepted as a login session', async () => {
    // The state travels through URLs, so it must not double as a session cookie.
    const state = await signSlackState(USER_ID)

    await expect(verifySession(state)).rejects.toThrow()
  })
})
