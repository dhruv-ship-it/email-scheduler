import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { googleAuthUrl, verifyGoogleCode } from './google'
import { requireAuth } from './require-auth'
import { SESSION_COOKIE, signSession } from './session'
import { toMe, upsertGoogleUser } from './users'

const STATE_COOKIE = 'g_state'
const STATE_COOKIE_PATH = '/api/auth'
const STATE_MAX_AGE_MS = 10 * 60 * 1000
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isProduction(): boolean {
  return env.NODE_ENV === 'production'
}

export const authRouter = Router()

authRouter.get('/google', (_req, res) => {
  const state = randomBytes(32).toString('base64url')
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: STATE_MAX_AGE_MS,
    path: STATE_COOKIE_PATH,
  })
  res.redirect(googleAuthUrl(state))
})

authRouter.get('/google/callback', async (req, res) => {
  const state = req.query['state']
  const code = req.query['code']
  const cookieState = req.cookies[STATE_COOKIE]
  if (typeof state !== 'string' || typeof cookieState !== 'string' || state !== cookieState) {
    res.redirect(`${env.APP_URL}/login?login=failed`)
    return
  }
  try {
    if (typeof code !== 'string') throw new Error('callback had no authorization code')
    const identity = await verifyGoogleCode(code)
    const user = await upsertGoogleUser(identity)
    const token = await signSession(user.id)
    res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH })
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    })
    res.redirect(`${env.APP_URL}/`)
  } catch (err) {
    logger.warn({ err }, 'google sign-in failed')
    res.redirect(`${env.APP_URL}/login?login=failed`)
  }
})

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.status(204).end()
})

export const meRouter = Router()

meRouter.get('/me', requireAuth, (req, res) => {
  // requireAuth always sets req.user before calling next(); this satisfies the type.
  if (!req.user) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.' } })
    return
  }
  res.json(toMe(req.user))
})
