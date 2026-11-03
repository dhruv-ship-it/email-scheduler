import type { EmailListResponse, EmailStatus, EmailTab } from '@scheduler/shared'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { BUSY_POLL_MS, IDLE_POLL_MS, pendingCount, useStats } from './use-stats'

export const PAGE_SIZE = 25

type ListFilter = { tab: EmailTab; status: EmailStatus | undefined; starred: boolean }

export function useEmailList({ tab, status, starred }: ListFilter) {
  // The list shares the stats query's cache entry, so this costs no extra request.
  const busy = pendingCount(useStats().data) > 0

  return useInfiniteQuery({
    queryKey: queryKeys.emails.list(tab, status, starred),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ tab, limit: String(PAGE_SIZE) })
      if (status) params.set('status', status)
      if (starred) params.set('starred', 'true')
      if (pageParam) params.set('cursor', pageParam)
      return api.get<EmailListResponse>(`/api/emails?${params.toString()}`)
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: busy ? BUSY_POLL_MS : IDLE_POLL_MS,
  })
}
