import { randomUUID } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env'

const AUDIENCE = 'slack-oauth'
const STATE_LIFETIME_SECONDS = 10 * 60

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET)
}

// The state carries the user, so the callback can identify them even when it arrives
// on a different host than the session cookie (a tunnel, locally). The audience keeps
// it from being usable as a session token, which shares the signing key.
export async function signSlackState(
  userId: string,
  lifetimeSeconds: number = STATE_LIFETIME_SECONDS,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(secretKey())
}

// Returns the user id, or throws for a bad signature, an expired token, or one that
// was not issued for this flow.
export async function verifySlackState(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey(), {
    audience: AUDIENCE,
    algorithms: ['HS256'],
  })
  if (typeof payload.sub !== 'string') throw new Error('state has no subject')
  return payload.sub
}
