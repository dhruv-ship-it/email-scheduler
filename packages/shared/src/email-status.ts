export const EMAIL_STATUSES = [
  'scheduled',
  'throttled',
  'sending',
  'sent',
  'failed',
  'cancelled',
] as const

export type EmailStatus = (typeof EMAIL_STATUSES)[number]

export const EMAIL_EVENT_TYPES = [
  'scheduled',
  'deferred',
  'sending',
  'sent',
  'retry',
  'failed',
  'cancelled',
  'requeued',
] as const

export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number]

export const EMAIL_TABS = ['scheduled', 'sent'] as const

export type EmailTab = (typeof EMAIL_TABS)[number]

/** What a tab lists when no status filter is set. */
export const TAB_DEFAULT_STATUSES: Record<EmailTab, readonly EmailStatus[]> = {
  scheduled: ['scheduled', 'throttled', 'sending'],
  sent: ['sent', 'failed'],
}

/** What a tab's status filter may narrow to. Cancelled only shows when asked for. */
export const TAB_FILTER_STATUSES: Record<EmailTab, readonly EmailStatus[]> = {
  scheduled: ['scheduled', 'throttled', 'sending'],
  sent: ['sent', 'failed', 'cancelled'],
}

export const TERMINAL_EMAIL_STATUSES = ['sent', 'failed', 'cancelled'] as const

export function tabForStatus(status: EmailStatus): EmailTab {
  return TAB_FILTER_STATUSES.scheduled.includes(status) ? 'scheduled' : 'sent'
}
