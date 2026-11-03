import {
  TAB_FILTER_STATUSES,
  type EmailListItem,
  type EmailStatus,
  type EmailTab,
} from '@scheduler/shared'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TopBar } from '../app/top-bar'
import { Button, buttonStyles } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { Spinner } from '../components/ui/spinner'
import { EmailRow } from '../features/emails/email-row'
import { FilterPopover } from '../features/emails/filter-popover'
import { useEmailList } from '../features/emails/use-email-list'
import { useFirstRunTour } from '../features/tour/tour'
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  useDebouncedValue,
  useEmailSearch,
} from '../features/emails/use-search'
import { useInView } from '../lib/use-in-view'

const SKELETON_ROWS = 6

function SkeletonRows() {
  return Array.from({ length: SKELETON_ROWS }, (_, index) => (
    <div key={index} className="flex h-11 items-center gap-4 border-b border-gray-100 px-[19px]">
      <Skeleton className="h-3 w-[140px]" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-3 flex-1" />
    </div>
  ))
}

function parseStatus(tab: EmailTab, value: string | null): EmailStatus | undefined {
  return TAB_FILTER_STATUSES[tab].find((status) => status === value)
}

export function MailListPage({ tab }: { tab: EmailTab }) {
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const status = parseStatus(tab, params.get('status'))
  const starred = params.get('starred') === '1'
  const filtered = status !== undefined || starred

  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const searching = query.length >= SEARCH_MIN_CHARS

  const list = useEmailList({ tab, status, starred })
  const results = useEmailSearch(tab, query)
  const items = useMemo<EmailListItem[]>(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  )

  useFirstRunTour(tab === 'scheduled' && list.isSuccess)

  const sentinel = useInView<HTMLDivElement>(
    () => void list.fetchNextPage(),
    !searching && list.hasNextPage && !list.isFetchingNextPage,
  )

  function updateFilter(next: { status?: EmailStatus | undefined; starred?: boolean }) {
    const merged = new URLSearchParams(params)
    const nextStatus = 'status' in next ? next.status : status
    const nextStarred = 'starred' in next ? next.starred : starred
    if (nextStatus) merged.set('status', nextStatus)
    else merged.delete('status')
    if (nextStarred) merged.set('starred', '1')
    else merged.delete('starred')
    setParams(merged, { replace: true })
  }

  return (
    <div>
      <TopBar search={search} onSearchChange={setSearch}>
        <FilterPopover
          tab={tab}
          status={status}
          starred={starred}
          onStatusChange={(value) => updateFilter({ status: value })}
          onStarredChange={(value) => updateFilter({ starred: value })}
        />
      </TopBar>

      <div className="mt-3.5 px-3">
        {searching ? (
          <>
            {results.data?.engine === 'postgres' && (
              <p className="px-[19px] py-2 text-small text-muted">
                Search index is unavailable, showing basic matches.
              </p>
            )}
            {results.isPending && <SkeletonRows />}
            {results.isError && (
              <EmptyState title="Search failed.">
                <Button variant="outline" onClick={() => void results.refetch()}>
                  Retry
                </Button>
              </EmptyState>
            )}
            {results.isSuccess && results.data.items.length === 0 && (
              <EmptyState title={`No emails match "${query}".`} />
            )}
            {results.data?.items.map(({ highlights, ...email }) => (
              <EmailRow
                key={email.id}
                email={email}
                showSentTime={tab === 'sent'}
                highlights={highlights}
              />
            ))}
          </>
        ) : (
          <>
            {list.isPending && <SkeletonRows />}

            {list.isError && (
              <EmptyState title="Couldn't load your emails.">
                <Button variant="outline" onClick={() => void list.refetch()}>
                  Retry
                </Button>
              </EmptyState>
            )}

            {list.isSuccess && items.length === 0 && (
              <div data-tour="first-row">
                <EmptyState
                  title={
                    filtered
                      ? 'No emails match this filter.'
                      : tab === 'scheduled'
                        ? 'Nothing scheduled.'
                        : 'Nothing sent yet.'
                  }
                >
                  {!filtered && tab === 'scheduled' && (
                    <Link to="/compose" className={buttonStyles('outline')}>
                      Compose
                    </Link>
                  )}
                </EmptyState>
              </div>
            )}

            {items.map((email, index) => (
              <EmailRow
                key={email.id}
                email={email}
                showSentTime={tab === 'sent'}
                tourTarget={index === 0}
              />
            ))}

            {list.hasNextPage && (
              <div ref={sentinel} className="flex h-12 items-center justify-center text-gray-400">
                {list.isFetchingNextPage && <Spinner />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
