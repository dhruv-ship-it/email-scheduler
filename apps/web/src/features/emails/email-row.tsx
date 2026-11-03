import type { EmailListItem } from '@scheduler/shared'
import { Star } from 'lucide-react'
import { Link } from 'react-router'
import { Tooltip } from '../../components/ui/tooltip'
import { cn } from '../../lib/cn'
import { formatSentTime } from './format'
import { Highlighted } from './highlight'
import { StatusBadge } from './status-badge'
import { useToggleStar } from './use-star'

export type RowHighlights = { subject?: string; bodyText?: string; recipient?: string }

type EmailRowProps = {
  email: EmailListItem
  showSentTime: boolean
  highlights?: RowHighlights
  // Marks the row the product tour points at.
  tourTarget?: boolean
}

// The whole row is one link stretched over its cells, so the badge and star can sit
// above it as separate controls without nesting interactive elements.
export function EmailRow({ email, showSentTime, highlights, tourTarget }: EmailRowProps) {
  const toggleStar = useToggleStar()
  const sentAt = email.sentAt && showSentTime ? formatSentTime(email.sentAt) : null

  return (
    <div
      data-tour={tourTarget ? 'first-row' : undefined}
      className="relative flex h-11 items-center gap-1 border-b border-gray-100 pr-[11px] pl-[19px] text-body hover:bg-surface"
    >
      <Link
        to={`/emails/${email.id}`}
        aria-label={`Open email to ${email.recipient}: ${email.subject}`}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset"
      />
      <span className="w-[165px] shrink-0 truncate pr-3 text-gray-900">
        To: {highlights?.recipient ? <Highlighted html={highlights.recipient} /> : email.recipient}
      </span>
      <span className="relative shrink-0">
        <StatusBadge email={email} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-gray-900">
          {highlights?.subject ? <Highlighted html={highlights.subject} /> : email.subject}
        </span>
        {(highlights?.bodyText || email.snippet) && (
          <span className="text-gray-400">
            {' - '}
            {highlights?.bodyText ? <Highlighted html={highlights.bodyText} /> : email.snippet}
          </span>
        )}
      </span>
      {sentAt && <span className="shrink-0 pl-3 text-caption text-muted">{sentAt}</span>}
      <Tooltip content={email.starred ? 'Remove star' : 'Star'}>
        <button
          type="button"
          aria-label={email.starred ? 'Remove star' : 'Star this email'}
          aria-pressed={email.starred}
          onClick={() => toggleStar.mutate({ id: email.id, starred: !email.starred })}
          className="relative ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-600"
        >
          <Star
            aria-hidden
            className={cn('size-3.5', email.starred && 'fill-[#f0b100] text-[#f0b100]')}
          />
        </button>
      </Tooltip>
    </div>
  )
}
