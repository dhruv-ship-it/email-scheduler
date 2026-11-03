import type { NextFunction, Request, Response } from 'express'
import type { UserRow } from '../../db/schema'
import { ApiError } from '../../lib/errors'
import { SESSION_COOKIE, verifySession } from './session'
import { findUserById } from './users'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow
    }
  }
}

const UNAUTHORIZED = (): ApiError => new ApiError('unauthorized', 'Sign in to continue.')

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies[SESSION_COOKIE]
  if (typeof token !== 'string') {
    next(UNAUTHORIZED())
    return
  }
  try {
    const userId = await verifySession(token)
    const user = await findUserById(userId)
    if (!user) {
      next(UNAUTHORIZED())
      return
    }
    req.user = user
    next()
  } catch {
    next(UNAUTHORIZED())
  }
}
