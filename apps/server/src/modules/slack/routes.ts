import type { SlackStatus } from '@scheduler/shared'
import { Router } from 'express'
import { env } from '../../config/env'
import { decrypt } from '../../lib/crypto'
import { ApiError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { requireAuth } from '../auth/require-auth'
import { isSlackConfigured, slackRedirectUri, SLACK_NOT_CONFIGURED } from './config'
import { deleteConnection, findConnection, upsertConnection } from './connection'
import { exchangeCode, revokeToken } from './slack-api'
import { signSlackState, verifySlackState } from './state'
import { postToWebhook } from './webhook'

export const slackRouter = Router()

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const TEST_MESSAGE =
  "Slack alerts are connected. You'll get a message here when one of your senders hits its hourly limit."

function requireConfigured(): void {
  if (!isSlackConfigured()) throw new ApiError('not_found', SLACK_NOT_CONFIGURED)
}

function userOf(req: { user?: { id: string } }): string {
  if (!req.user) throw new ApiError('unauthorized', 'Sign in to continue.')
  return req.user.id
}

slackRouter.get('/integrations/slack', requireAuth, async (req, res) => {
  const userId = userOf(req)
  if (!isSlackConfigured()) {
    const status: SlackStatus = { configured: false, connected: false }
    res.json(status)
    return
  }
  const connection = await findConnection(userId)
  const status: SlackStatus = connection
    ? {
        configured: true,
        connected: true,
        teamName: connection.teamName,
        channelName: connection.channelName,
        connectedAt: connection.connectedAt.toISOString(),
      }
    : { configured: true, connected: false }
  res.json(status)
})

slackRouter.get('/integrations/slack/connect', requireAuth, async (req, res) => {
  requireConfigured()
  const state = await signSlackState(userOf(req))
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID)
  url.searchParams.set('scope', 'incoming-webhook')
  url.searchParams.set('redirect_uri', slackRedirectUri())
  url.searchParams.set('state', state)
  res.redirect(url.toString())
})

// No session is needed here: Slack sends the browser back, and the signed state says
// which user started the flow.
slackRouter.get('/integrations/slack/callback', async (req, res) => {
  requireConfigured()
  const back = (result: 'connected' | 'denied' | 'error') =>
    res.redirect(`${env.APP_URL}/?slack=${result}`)

  if (req.query['error'] !== undefined) {
    back('denied')
    return
  }
  const code = req.query['code']
  const state = req.query['state']
  if (typeof code !== 'string' || typeof state !== 'string') {
    back('error')
    return
  }

  let userId: string
  try {
    userId = await verifySlackState(state)
  } catch {
    back('error')
    return
  }

  try {
    const oauth = await exchangeCode(code)
    const webhook = oauth.incoming_webhook
    if (
      !oauth.ok ||
      !oauth.access_token ||
      !oauth.team?.id ||
      !webhook?.url ||
      !webhook.channel_id
    ) {
      logger.warn({ slackError: oauth.error }, 'slack did not complete the connection')
      back('error')
      return
    }
    await upsertConnection({
      userId,
      teamId: oauth.team.id,
      teamName: oauth.team.name ?? oauth.team.id,
      channelId: webhook.channel_id,
      channelName: (webhook.channel ?? webhook.channel_id).replace(/^#/, ''),
      webhookUrl: webhook.url,
      accessToken: oauth.access_token,
    })
  } catch (err) {
    logger.error({ err }, 'slack connection failed')
    back('error')
    return
  }
  back('connected')
})

slackRouter.post('/integrations/slack/test', requireAuth, async (req, res) => {
  requireConfigured()
  const userId = userOf(req)
  const connection = await findConnection(userId)
  if (!connection) throw new ApiError('validation_failed', "Slack isn't connected.")

  const result = await postToWebhook(decrypt(connection.webhookUrlEnc), { text: TEST_MESSAGE })
  if (result.kind === 'ok') {
    res.status(204).end()
    return
  }
  if (result.kind === 'revoked') {
    await deleteConnection(userId)
    throw new ApiError('conflict', 'That Slack connection no longer works. Connect Slack again.')
  }
  throw new ApiError('unavailable', "Slack didn't accept the message. Try again in a moment.")
})

slackRouter.delete('/integrations/slack', requireAuth, async (req, res) => {
  requireConfigured()
  const userId = userOf(req)
  const connection = await findConnection(userId)
  if (connection) {
    await revokeToken(decrypt(connection.accessTokenEnc))
    await deleteConnection(userId)
  }
  res.status(204).end()
})
