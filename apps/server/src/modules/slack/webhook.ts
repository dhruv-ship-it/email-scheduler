const REQUEST_TIMEOUT_MS = 10_000

// Bodies Slack sends when the webhook is gone for good: the app was uninstalled, the
// channel was deleted or archived, or the grant was withdrawn.
const REVOKED_BODIES = new Set([
  'no_service',
  'channel_not_found',
  'channel_is_archived',
  'invalid_token',
  'action_prohibited',
])

export type WebhookResult =
  | { kind: 'ok' }
  // The connection can never work again and should be dropped.
  | { kind: 'revoked' }
  // Worth trying again later: rate limited, a server error or no connection.
  | { kind: 'retry'; reason: string }
  // Slack understood and refused; resending the same payload will not help.
  | { kind: 'rejected'; reason: string }

export async function postToWebhook(url: string, payload: object): Promise<WebhookResult> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    return { kind: 'retry', reason: err instanceof Error ? err.message : 'network error' }
  }

  if (response.ok) return { kind: 'ok' }

  const body = (await response.text().catch(() => '')).trim()
  if (response.status === 404 || response.status === 410 || REVOKED_BODIES.has(body)) {
    return { kind: 'revoked' }
  }
  if (response.status === 429 || response.status >= 500) {
    return { kind: 'retry', reason: `Slack answered ${response.status}` }
  }
  return { kind: 'rejected', reason: `Slack answered ${response.status} ${body}`.trim() }
}
