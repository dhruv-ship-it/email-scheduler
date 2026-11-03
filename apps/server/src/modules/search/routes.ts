import { Router } from 'express'
import { z } from 'zod'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../auth/require-auth'
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SEARCH_TABS } from './query'
import { searchEmails } from './search'

export const searchRouter = Router()

const searchQuerySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH),
  tab: z.enum(SEARCH_TABS).default('all'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

// Mounted ahead of the emails router: "search" would otherwise be read as an email id.
searchRouter.get('/emails/search', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const query = searchQuerySchema.parse(req.query)
  res.json(await searchEmails({ userId: req.user.id, ...query }))
})
