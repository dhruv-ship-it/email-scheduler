import { z } from 'zod'
import { EMAIL_EVENT_TYPES, EMAIL_STATUSES } from './email-status'

const START_AT_PAST_SLACK_MS = 60_000
const START_AT_FUTURE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000

// delaySeconds only gets its lower bound from MIN_SEND_INTERVAL_MS, an env value
// this schema can't see; the route checks that bound itself after parsing.
export const createCampaignInput = z.object({
  senderId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().min(1).max(100_000),
  startAt: z
    .string()
    .datetime()
    .refine((value) => {
      const t = Date.parse(value)
      const now = Date.now()
      return t >= now - START_AT_PAST_SLACK_MS && t <= now + START_AT_FUTURE_LIMIT_MS
    }, 'startAt must be no more than a minute in the past and no more than 30 days out'),
  delaySeconds: z.number().int().min(0).max(3600),
  hourlyLimit: z.number().int().min(1).max(10_000),
  recipients: z.array(z.string()).min(1).max(10_000),
})
export type CreateCampaignInput = z.infer<typeof createCampaignInput>

export const createCampaignResult = z.object({
  campaignId: z.string().uuid(),
  accepted: z.number().int(),
  duplicates: z.number().int(),
  invalid: z.number().int(),
  firstSendAt: z.string(),
  lastSendAt: z.string(),
  queued: z.boolean(),
})
export type CreateCampaignResult = z.infer<typeof createCampaignResult>

export const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})
export type Me = z.infer<typeof meSchema>

export const senderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  hourlyLimit: z.number().int(),
})
export type Sender = z.infer<typeof senderSchema>

export const limitsConfigSchema = z.object({
  minSendIntervalMs: z.number().int(),
  defaultSenderHourlyLimit: z.number().int(),
  windowMs: z.number().int(),
})
export type LimitsConfig = z.infer<typeof limitsConfigSchema>

export const emailListItemSchema = z.object({
  id: z.string().uuid(),
  recipient: z.string(),
  subject: z.string(),
  snippet: z.string(),
  status: z.enum(EMAIL_STATUSES),
  scheduledAt: z.string(),
  sentAt: z.string().nullable(),
  senderName: z.string(),
  throttledBy: z.string().nullable(),
  lastError: z.string().nullable(),
  starred: z.boolean(),
})
export type EmailListItem = z.infer<typeof emailListItemSchema>

export const emailListResponseSchema = z.object({
  items: z.array(emailListItemSchema),
  nextCursor: z.string().nullable(),
})
export type EmailListResponse = z.infer<typeof emailListResponseSchema>

export const emailStatsSchema = z.object({
  scheduled: z.number().int(),
  throttled: z.number().int(),
  sending: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
})
export type EmailStats = z.infer<typeof emailStatsSchema>

export const emailEventSchema = z.object({
  type: z.enum(EMAIL_EVENT_TYPES),
  at: z.string(),
  data: z.unknown().nullable(),
})
export type EmailEvent = z.infer<typeof emailEventSchema>

export const emailDetailSchema = emailListItemSchema.extend({
  bodyHtml: z.string(),
  bodyText: z.string(),
  senderEmail: z.string(),
  previewUrl: z.string().nullable(),
  attempts: z.number().int(),
  campaignId: z.string().uuid(),
  events: z.array(emailEventSchema),
})
export type EmailDetail = z.infer<typeof emailDetailSchema>

export const searchResponseSchema = z.object({
  engine: z.enum(['elasticsearch', 'postgres']),
  total: z.number().int(),
  items: z.array(
    emailListItemSchema.extend({
      highlights: z
        .object({
          subject: z.string().optional(),
          bodyText: z.string().optional(),
          recipient: z.string().optional(),
        })
        .optional(),
    }),
  ),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>

export const slackStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  teamName: z.string().optional(),
  channelName: z.string().optional(),
  connectedAt: z.string().optional(),
})
export type SlackStatus = z.infer<typeof slackStatusSchema>
