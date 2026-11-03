import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import type { RequestHandler, Router } from 'express'
import { env } from '../../config/env'
import { emailSendQueue, notificationsQueue, searchSyncQueue } from '../../queue/queues'

export const BULL_BOARD_PATH = '/api/admin/queues'

function buildRouter(): Router {
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath(BULL_BOARD_PATH)
  // In production the board is read-only: a signed-in user can look at the queues
  // but not retry or delete jobs.
  const readOnlyMode = env.BULL_BOARD_READ_ONLY
  createBullBoard({
    queues: [emailSendQueue, searchSyncQueue, notificationsQueue].map(
      (queue) => new BullMQAdapter(queue, { readOnlyMode }),
    ),
    serverAdapter,
  })
  return serverAdapter.getRouter() as Router
}

// Built on the first request rather than when the app is created, so creating the app
// stays independent of the queues and the board costs nothing until someone opens it.
// The caller puts requireAuth in front of this handler.
export function bullBoardHandler(): RequestHandler {
  let router: Router | null = null
  return (req, res, next) => {
    router ??= buildRouter()
    router(req, res, next)
  }
}
