import { tabForStatus } from '@scheduler/shared'
import { ArrowLeft, ArrowUpRight, ChevronDown, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Avatar } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/dialog'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { Tooltip } from '../components/ui/tooltip'
import { useMe } from '../features/auth/use-me'
import { formatSentTime } from '../features/emails/format'
import { Timeline } from '../features/emails/timeline'
import { useCancelEmail, useEmailDetail } from '../features/emails/use-email-detail'
import { useToggleStar } from '../features/emails/use-star'
import { ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { useGoBack } from '../lib/use-go-back'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[90px] shrink-0 text-muted">{label}</dt>
      <dd className="text-gray-700">{value}</dd>
    </div>
  )
}

export function EmailDetailPage() {
  const { id } = useParams()
  const me = useMe().data
  const detail = useEmailDetail(id)
  const toggleStar = useToggleStar()
  const cancel = useCancelEmail(id ?? '')
  const [showDetails, setShowDetails] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const email = detail.data

  const goBack = useGoBack(email ? `/${tabForStatus(email.status)}` : '/scheduled')

  const cancellable = email?.status === 'scheduled' || email?.status === 'throttled'

  return (
    <div className="min-h-screen">
      <header className="flex h-[54px] items-center gap-3 px-5">
        <Button variant="ghost" aria-label="Back" onClick={goBack}>
          <ArrowLeft aria-hidden className="size-4" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-title text-gray-900">
          {email ? email.subject : detail.isPending ? '' : 'Email'}
        </h1>
        {email && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="size-7"
              aria-label={email.starred ? 'Remove star' : 'Star this email'}
              aria-pressed={email.starred}
              onClick={() => toggleStar.mutate({ id: email.id, starred: !email.starred })}
            >
              <Star
                aria-hidden
                className={cn('size-4', email.starred && 'fill-[#f0b100] text-[#f0b100]')}
              />
            </Button>
            {cancellable && (
              <Tooltip content="Cancel this email">
                <Button
                  variant="ghost"
                  className="size-7"
                  aria-label="Cancel this email"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-gray-200" />
        {me && <Avatar name={me.name} src={me.avatarUrl} className="size-6" />}
      </header>

      <div className="mx-auto mt-3 w-[777px] max-w-full px-5">
        {detail.isPending && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full max-w-[600px]" />
            <Skeleton className="h-4 w-full max-w-[520px]" />
          </div>
        )}

        {detail.isError && (
          <EmptyState
            title={
              detail.error instanceof ApiError && detail.error.status === 404
                ? "That email doesn't exist."
                : "Couldn't load this email."
            }
          >
            {!(detail.error instanceof ApiError && detail.error.status === 404) && (
              <Button variant="outline" onClick={() => void detail.refetch()}>
                Retry
              </Button>
            )}
          </EmptyState>
        )}

        {email && (
          <>
            <div className="flex items-start gap-2.5">
              <Avatar name={email.senderName} className="size-8 text-body" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small">
                  <span className="font-bold text-gray-900">{email.senderName}</span>{' '}
                  <span className="text-muted">&lt;{email.senderEmail}&gt;</span>
                </p>
                <button
                  type="button"
                  aria-expanded={showDetails}
                  onClick={() => setShowDetails((open) => !open)}
                  className="mt-0.5 flex items-center gap-0.5 text-caption text-muted"
                >
                  to {email.recipient}
                  <ChevronDown aria-hidden className={cn('size-3', showDetails && 'rotate-180')} />
                </button>
              </div>
              <span className="shrink-0 pt-0.5 text-caption text-muted">
                {email.sentAt
                  ? formatSentTime(email.sentAt)
                  : `Scheduled for ${formatSentTime(email.scheduledAt)}`}
              </span>
            </div>

            {showDetails && (
              <dl className="mt-3 ml-[42px] flex max-w-[600px] flex-col gap-1 rounded-lg bg-surface px-3 py-2.5 text-small">
                <DetailRow label="Status" value={email.status} />
                <DetailRow label="Scheduled" value={formatSentTime(email.scheduledAt)} />
                {email.sentAt && <DetailRow label="Sent" value={formatSentTime(email.sentAt)} />}
                <DetailRow label="Attempts" value={String(email.attempts)} />
                {email.lastError && <DetailRow label="Last error" value={email.lastError} />}
              </dl>
            )}

            <div
              className="email-body mt-6 ml-[42px]"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />

            <section
              aria-label="Delivery"
              className="mt-10 ml-[42px] max-w-[600px] border-t border-gray-100 pt-4 pb-10 text-small text-muted"
            >
              <h2 className="mb-2 text-caption tracking-wide uppercase">Delivery</h2>
              <Timeline events={email.events} />
              {email.previewUrl && (
                <a
                  href={email.previewUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-1 text-brand hover:underline"
                >
                  Open in Ethereal
                  <ArrowUpRight aria-hidden className="size-3" />
                </a>
              )}
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Cancel this email?"
        description="It won't be sent."
        confirmLabel="Cancel email"
        cancelLabel="Keep"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
      />
    </div>
  )
}
