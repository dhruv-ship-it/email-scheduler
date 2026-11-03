import { env } from '../../config/env'

export const SLACK_NOT_CONFIGURED = "Slack isn't configured on this server."

export function isSlackConfigured(): boolean {
  return env.SLACK_CLIENT_ID !== '' && env.SLACK_CLIENT_SECRET !== ''
}

// Slack only accepts https redirect URLs, so locally a tunnel's origin can stand in
// for the app's own. The same value has to be sent when authorizing and when exchanging.
export function slackRedirectUri(): string {
  return `${env.SLACK_REDIRECT_BASE_URL || env.APP_URL}/api/integrations/slack/callback`
}
