import type { EmailEvent } from '@scheduler/shared'
import { format, isValid } from 'date-fns'
import { formatClock } from './format'

function field(data: unknown, key: string): unknown {
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined
}

// The deferral time is stored by the worker as either epoch milliseconds or an ISO string.
function clockFrom(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  return isValid(date) ? formatClock(date.toISOString()) : ''
}

export function eventLabel(event: EmailEvent): string {
  switch (event.type) {
    case 'scheduled':
      return 'Scheduled'
    case 'deferred': {
      const until = clockFrom(field(event.data, 'until'))
      return until ? `Held by hourly limit until ${until}` : 'Held by hourly limit'
    }
    case 'sending': {
      const attempt = field(event.data, 'attempt')
      return typeof attempt === 'number' ? `Sending (attempt ${attempt})` : 'Sending'
    }
    case 'sent':
      return 'Sent'
    case 'retry':
      return 'Retry after an error'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'requeued':
      return 'Re-queued after a restart'
  }
}

export function Timeline({ events }: { events: EmailEvent[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="flex gap-3">
          <time dateTime={event.at} className="w-[150px] shrink-0 tabular-nums">
            {format(new Date(event.at), 'MMM d, h:mm:ss a')}
          </time>
          <span className="text-gray-700">{eventLabel(event)}</span>
        </li>
      ))}
    </ol>
  )
}
