import { EMAIL_STATUSES, EMAIL_TABS } from '@scheduler/shared'
import { type Request, Router } from 'express'
import { z } from 'zod'
import { ApiError } from '../../lib/errors'
import { emailSendQueue } from '../../queue/queues'
import { requireAuth } from '../auth/require-auth'
import {
  findOwnedEmail,
  getEmailDetail,
  getEmailListItem,
  getEmailStats,
  listEmails,
  setStarred,
} from './list'
import { transition } from './transition'

export const emailsRouter = Router()

const idParamSchema = z.string().uuid()

// A malformed id can never match a row, and letting it reach Postgres as a uuid
// query parameter would throw a syntax error instead of a clean 404.
function paramId(req: Request): string {
  const id = req.params.id
  if (typeof id !== 'string' || !idParamSchema.safeParse(id).success) {
    throw new ApiError('not_found', "That email doesn't exist.")
  }
  return id
}

const listQuerySchema = z.object({
  tab: z.enum(EMAIL_TABS),
  status: z.enum(EMAIL_STATUSES).optional(),
  starred: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

emailsRouter.get('/emails', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const query = listQuerySchema.parse(req.query)
  const result = await listEmails({
    userId: req.user.id,
    tab: query.tab,
    status: query.status,
    starred: query.starred === 'true',
    cursor: query.cursor,
    limit: query.limit,
  })
  res.json(result)
})

emailsRouter.get('/emails/stats', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  res.json(await getEmailStats(req.user.id))
})

emailsRouter.get('/emails/:id', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const detail = await getEmailDetail(req.user.id, paramId(req))
  if (!detail) throw new ApiError('not_found', "That email doesn't exist.")
  res.json(detail)
})

const patchBodySchema = z.object({ starred: z.boolean() })

emailsRouter.patch('/emails/:id', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const { starred } = patchBodySchema.parse(req.body)
  const item = await setStarred(req.user.id, paramId(req), starred)
  if (!item) throw new ApiError('not_found', "That email doesn't exist.")
  res.json(item)
})

emailsRouter.post('/emails/:id/cancel', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const id = paramId(req)
  const owned = await findOwnedEmail(req.user.id, id)
  if (!owned) throw new ApiError('not_found', "That email doesn't exist.")

  const updated = await transition(
    id,
    ['scheduled', 'throttled'],
    'cancelled',
    {},
    { type: 'cancelled' },
  )
  if (!updated) throw new ApiError('conflict', 'This email is already on its way or done.')

  try {
    await emailSendQueue.remove(id)
  } catch (err) {
    req.log.warn({ err, emailId: id }, 'could not remove the queued job for a cancelled email')
  }
  res.json(await getEmailListItem(id))
})
