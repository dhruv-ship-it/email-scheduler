import { createCampaignInput } from '@scheduler/shared'
import { Router } from 'express'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../auth/require-auth'
import { createCampaign } from './create-campaign'

export const campaignsRouter = Router()

// Express 5 forwards a rejected promise from an async handler to the error
// middleware on its own, so a thrown ZodError or ApiError needs no local catch.
campaignsRouter.post('/campaigns', requireAuth, async (req, res) => {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  const input = createCampaignInput.parse(req.body)
  const result = await createCampaign({ ...input, userId: req.user.id })
  res.status(201).json(result)
})
