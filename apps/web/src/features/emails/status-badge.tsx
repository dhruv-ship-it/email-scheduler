import type { EmailListItem } from '@scheduler/shared'
import { Clock, Hourglass } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Spinner } from '../../components/ui/spinner'
import { Tooltip } from '../../components/ui/tooltip'
import { formatBadgeTime, formatClock, formatFullDate, formatRelative } from './format'

const HELD_BY: Record<string, string> = {
  sender: "the sender's hourly limit",
  campaign: "this campaign's hourly limit",
  global: 'the overall hourly limit',
}

type StatusBadgeProps = {
  email: Pick<EmailListItem, 'status' | 'scheduledAt' | 'throttledBy' | 'lastError'>
}

export function StatusBadge({ email }: StatusBadgeProps) {
  switch (email.status) {
    case 'scheduled':
      return (
        <Tooltip
          content={`${formatRelative(email.scheduledAt)} (${formatFullDate(email.scheduledAt)})`}
        >
          <Badge tone="orange">
            <Clock aria-hidden className="size-3" />
            {formatBadgeTime(email.scheduledAt)}
          </Badge>
        </Tooltip>
      )
    case 'throttled': {
      const reason = HELD_BY[email.throttledBy ?? ''] ?? 'an hourly limit'
      return (
        <Tooltip content={`Held by ${reason}. Goes out at ${formatClock(email.scheduledAt)}`}>
          <Badge tone="yellow">
            <Hourglass aria-hidden className="size-3" />
            {formatBadgeTime(email.scheduledAt)}
          </Badge>
        </Tooltip>
      )
    }
    case 'sending':
      return (
        <Badge tone="blue">
          <Spinner className="size-3" />
          Sending
        </Badge>
      )
    case 'failed':
      return (
        <Tooltip content={email.lastError ?? 'The email could not be delivered.'}>
          <Badge tone="red">Failed</Badge>
        </Tooltip>
      )
    case 'cancelled':
      return <Badge tone="gray">Cancelled</Badge>
    case 'sent':
      return <Badge tone="gray">Sent</Badge>
  }
}
