import { EMAIL_EVENT_TYPES, EMAIL_STATUSES } from '@scheduler/shared'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const emailStatusEnum = pgEnum('email_status', EMAIL_STATUSES)
export const emailEventTypeEnum = pgEnum('email_event_type', EMAIL_EVENT_TYPES)

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
})

export const senders = pgTable('senders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpSecure: boolean('smtp_secure').notNull(),
  smtpUser: text('smtp_user').notNull(),
  // null means the env default (MAX_EMAILS_PER_HOUR_PER_SENDER) applies.
  smtpPassEnc: text('smtp_pass_enc').notNull(),
  hourlyLimit: integer('hourly_limit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => senders.id),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  delayMs: integer('delay_ms').notNull(),
  hourlyLimit: integer('hourly_limit').notNull(),
  total: integer('total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    // Denormalized from the campaign so list and stats queries don't need a join.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => senders.id),
    recipient: text('recipient').notNull(),
    seq: integer('seq').notNull(),
    status: emailStatusEnum('status').notNull().default('scheduled'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    // The original plan. Unlike scheduled_at, this never changes once set.
    plannedAt: timestamp('planned_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    throttledBy: text('throttled_by'),
    messageId: text('message_id'),
    previewUrl: text('preview_url'),
    starred: boolean('starred').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('emails_campaign_recipient_key').on(table.campaignId, table.recipient),
    index('emails_user_status_scheduled_idx').on(table.userId, table.status, table.scheduledAt),
    index('emails_user_sent_idx').on(table.userId, table.sentAt.desc()),
    // Used by the boot reconciler to page through everything still in flight.
    index('emails_pending_scheduled_idx')
      .on(table.scheduledAt)
      .where(sql`${table.status} in ('scheduled','throttled','sending')`),
  ],
)

export const emailEvents = pgTable(
  'email_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id),
    type: emailEventTypeEnum('type').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    data: jsonb('data'),
  },
  (table) => [index('email_events_email_at_idx').on(table.emailId, table.at)],
)

export const slackConnections = pgTable('slack_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  teamId: text('team_id').notNull(),
  teamName: text('team_name').notNull(),
  channelId: text('channel_id').notNull(),
  channelName: text('channel_name').notNull(),
  webhookUrlEnc: text('webhook_url_enc').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserRow = typeof users.$inferSelect
export type SenderRow = typeof senders.$inferSelect
export type CampaignRow = typeof campaigns.$inferSelect
export type EmailRow = typeof emails.$inferSelect
export type EmailEventRow = typeof emailEvents.$inferSelect
export type SlackConnectionRow = typeof slackConnections.$inferSelect
