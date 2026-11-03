const SUBJECT_LIMIT = 150

// Slack renders this token in each reader's own time zone; the text after the bar is
// what clients that cannot render tokens show instead.
export function slackDate(ms: number): string {
  const fallback = `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
  return `<!date^${Math.floor(ms / 1000)}^{date_short_pretty} {time}|${fallback}>`
}

// Slack reads these three characters as control characters in mrkdwn text.
export function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shorten(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

export type RateLimitMessageArgs = {
  senderName: string
  senderEmail: string
  limit: number
  windowStart: number
  windowMs: number
  deferredUntil: number
  subject: string
}

export function rateLimitMessage(args: RateLimitMessageArgs) {
  const field = (label: string, value: string) => ({ type: 'mrkdwn', text: `*${label}*\n${value}` })
  return {
    text: `Hourly limit reached for ${args.senderEmail}: ${args.limit} per hour. Next send ${slackDate(args.deferredUntil)}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Hourly limit reached' } },
      {
        type: 'section',
        fields: [
          field('Sender', `${escapeSlack(args.senderName)} (${escapeSlack(args.senderEmail)})`),
          field('Limit', `${args.limit} per hour`),
          field(
            'Window',
            `${slackDate(args.windowStart)} to ${slackDate(args.windowStart + args.windowMs)}`,
          ),
          field('Next send', slackDate(args.deferredUntil)),
          field('Campaign', escapeSlack(shorten(args.subject, SUBJECT_LIMIT))),
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Deferred emails keep their order and resume automatically.',
          },
        ],
      },
    ],
  }
}
