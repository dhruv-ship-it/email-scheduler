import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env'

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'
const REDIRECT_URI = `${env.APP_URL}${GOOGLE_CALLBACK_PATH}`

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, REDIRECT_URI)

export function googleAuthUrl(state: string): string {
  return client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    redirect_uri: REDIRECT_URI,
  })
}

export type GoogleIdentity = {
  googleSub: string
  email: string
  name: string
  avatarUrl: string | null
}

export async function verifyGoogleCode(code: string): Promise<GoogleIdentity> {
  const { tokens } = await client.getToken({ code, redirect_uri: REDIRECT_URI })
  if (typeof tokens.id_token !== 'string') {
    throw new Error('google token response had no id_token')
  }
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID })
  const payload = ticket.getPayload()
  if (!payload || !payload.email_verified || !payload.sub || !payload.email) {
    throw new Error('google identity was missing required fields')
  }
  return {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  }
}
