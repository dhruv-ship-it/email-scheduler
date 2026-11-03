import { format, formatDistanceToNowStrict, isValid } from 'date-fns'

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000

function toDate(iso: string): Date | null {
  const date = new Date(iso)
  return isValid(date) ? date : null
}

/** "Tue 9:15:12 AM" for the coming week, "Nov 12, 9:15 AM" for anything further out. */
export function formatBadgeTime(iso: string, now: Date = new Date()): string {
  const date = toDate(iso)
  if (!date) return ''
  const near = Math.abs(date.getTime() - now.getTime()) < SIX_DAYS_MS
  return near ? format(date, 'EEE h:mm:ss a') : format(date, 'MMM d, h:mm a')
}

/** "Nov 3, 10:23 AM". */
export function formatSentTime(iso: string): string {
  const date = toDate(iso)
  return date ? format(date, 'MMM d, h:mm a') : ''
}

export function formatClock(iso: string): string {
  const date = toDate(iso)
  return date ? format(date, 'h:mm a') : ''
}

export function formatFullDate(iso: string): string {
  const date = toDate(iso)
  return date ? format(date, 'EEEE, MMM d, yyyy, h:mm:ss a') : ''
}

/** "in 4 minutes" or "3 hours ago". */
export function formatRelative(iso: string): string {
  const date = toDate(iso)
  return date ? formatDistanceToNowStrict(date, { addSuffix: true }) : ''
}
