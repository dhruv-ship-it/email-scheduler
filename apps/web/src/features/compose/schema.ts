import { EMAIL_REGEX } from '@scheduler/shared'
import { z } from 'zod'

export const MAX_RECIPIENTS = 10_000
const MAX_DELAY_SECONDS = 3600
const MAX_HOURLY_LIMIT = 10_000
const START_PAST_SLACK_MS = 60_000
const START_FUTURE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000

export function isValidAddress(address: string): boolean {
  return EMAIL_REGEX.test(address)
}

// The editor yields markup even for a document of empty paragraphs or spaces.
function hasText(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim().length > 0
  )
}

// Mirrors the bounds of createCampaignInput in the shared package, with messages
// worded for the form. The minimum delay depends on the server's configuration.
export function composeSchema(minDelaySeconds: number) {
  return z.object({
    senderId: z.string().min(1, 'Choose a sender.'),
    recipients: z
      .array(z.string())
      .min(1, 'Add at least one recipient.')
      .max(MAX_RECIPIENTS, `Lists are limited to ${MAX_RECIPIENTS.toLocaleString()} addresses.`)
      .refine((all) => all.every(isValidAddress), 'Fix or remove the addresses marked in red.'),
    subject: z
      .string()
      .trim()
      .min(1, 'Add a subject.')
      .max(200, 'Keep the subject under 200 characters.'),
    bodyHtml: z.string().refine(hasText, 'Write a message.'),
    delaySeconds: z
      .number({ error: 'Enter the seconds between emails.' })
      .int('Use whole seconds.')
      .min(minDelaySeconds, `The delay must be at least ${minDelaySeconds} seconds.`)
      .max(MAX_DELAY_SECONDS, `The delay can be at most ${MAX_DELAY_SECONDS} seconds.`),
    hourlyLimit: z
      .number({ error: 'Enter an hourly limit.' })
      .int('Use a whole number.')
      .min(1, 'The hourly limit must be at least 1.')
      .max(
        MAX_HOURLY_LIMIT,
        `The hourly limit can be at most ${MAX_HOURLY_LIMIT.toLocaleString()}.`,
      ),
    startAt: z
      .date()
      .nullable()
      .refine(
        (value) => value === null || value.getTime() >= Date.now() - START_PAST_SLACK_MS,
        "Pick a time that isn't in the past.",
      )
      .refine(
        (value) => value === null || value.getTime() <= Date.now() + START_FUTURE_LIMIT_MS,
        'Pick a time within the next 30 days.',
      ),
  })
}

export type ComposeValues = z.infer<ReturnType<typeof composeSchema>>
