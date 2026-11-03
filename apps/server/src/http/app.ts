import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { ZodError } from 'zod'
import { env } from '../config/env'
import { ApiError } from '../lib/errors'
import { logger } from '../lib/logger'
import { BULL_BOARD_PATH, bullBoardHandler } from '../modules/admin/bull-board'
import { requireAuth } from '../modules/auth/require-auth'
import { authRouter, meRouter } from '../modules/auth/routes'
import { campaignsRouter } from '../modules/campaigns/routes'
import { emailsRouter } from '../modules/emails/routes'
import { searchRouter } from '../modules/search/routes'
import { sendersRouter } from '../modules/senders/routes'
import { slackRouter } from '../modules/slack/routes'
import { jsonContentTypeGuard } from './json-guard'

function requestId(req: Request, res: Response): string {
  const header = req.headers['x-request-id']
  const id = typeof header === 'string' && header.length > 0 ? header : randomUUID()
  res.setHeader('x-request-id', id)
  return id
}

function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Some fields need fixing.',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
    return
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    })
    return
  }
  req.log.error({ err }, 'request failed')
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.' } })
}

export function createApp(): Express {
  const app = express()
  app.disable('x-powered-by')
  // Behind Caddy, and behind the Vercel rewrite in front of it, the real client and
  // protocol arrive in X-Forwarded-* headers; Secure cookies depend on reading them.
  if (env.NODE_ENV === 'production') app.set('trust proxy', true)
  app.use(helmet())
  app.use(
    pinoHttp({
      logger,
      genReqId: requestId,
      customLogLevel: (_req, res, err) => {
        if (err !== undefined || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
      // Default serializers dump every header, which is noise and a place for secrets to leak.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  )
  app.use(cookieParser())
  app.use(express.json({ limit: '2mb' }))
  app.use(jsonContentTypeGuard)

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  // Behind the browser session, like every other route except health and sign-in.
  app.use(BULL_BOARD_PATH, requireAuth, bullBoardHandler())

  app.use('/api/auth', authRouter)
  app.use('/api', meRouter)
  app.use('/api', sendersRouter)
  app.use('/api', slackRouter)
  app.use('/api', campaignsRouter)
  // Ahead of the emails router so "/emails/search" is not taken for an email id.
  app.use('/api', searchRouter)
  app.use('/api', emailsRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: "That endpoint doesn't exist." } })
  })
  app.use(errorHandler)

  return app
}
