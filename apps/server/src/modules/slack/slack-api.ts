import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { slackRedirectUri } from './config'

const OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access'
const REVOKE_URL = 'https://slack.com/api/auth.revoke'
const REQUEST_TIMEOUT_MS = 10_000

export type SlackOAuthResponse = {
  ok: boolean
  error?: string
  access_token?: string
  team?: { id?: string; name?: string }
  incoming_webhook?: { channel?: string; channel_id?: string; url?: string }
}

export async function exchangeCode(code: string): Promise<SlackOAuthResponse> {
  const response = await fetch(OAUTH_ACCESS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: slackRedirectUri(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return (await response.json()) as SlackOAuthResponse
}

// Best effort: disconnecting must work even if Slack is unreachable or the token is
// already dead, so a failure here is logged and otherwise ignored.
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    logger.warn({ err }, 'could not revoke the slack token')
  }
}
