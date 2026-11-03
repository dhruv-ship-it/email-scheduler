import { jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env'

export const SESSION_COOKIE = 'sid'
const SESSION_EXPIRY = '7d'

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET)
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(secretKey())
}

export async function verifySession(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey())
  if (typeof payload.sub !== 'string') {
    throw new Error('session token has no subject')
  }
  // Other tokens signed with this key, such as the Slack OAuth state, carry an
  // audience and travel through URLs; none of them may be accepted as a login.
  if (payload.aud !== undefined) {
    throw new Error('not a session token')
  }
  return payload.sub
}
