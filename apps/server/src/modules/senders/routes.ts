import { Router } from 'express'
import { env } from '../../config/env'
import { senders } from '../../db/schema'
import { db } from '../../lib/db'
import { requireAuth } from '../auth/require-auth'

export const sendersRouter = Router()

sendersRouter.get('/senders', requireAuth, async (_req, res) => {
  const rows = await db.select().from(senders)
  res.json(
    rows.map((sender) => ({
      id: sender.id,
      name: sender.name,
      email: sender.email,
      hourlyLimit: sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    })),
  )
})

sendersRouter.get('/config/limits', requireAuth, (_req, res) => {
  res.json({
    minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
    defaultSenderHourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    windowMs: env.RATE_WINDOW_MS,
  })
})
