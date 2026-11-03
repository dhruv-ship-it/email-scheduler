import type { EmailStats } from '@scheduler/shared'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

export const BUSY_POLL_MS = 5_000
export const IDLE_POLL_MS = 30_000

export function pendingCount(stats: EmailStats | undefined): number {
  return stats ? stats.scheduled + stats.throttled + stats.sending : 0
}

export function sentCount(stats: EmailStats | undefined): number {
  return stats ? stats.sent + stats.failed : 0
}

// Polling stops while the browser tab is hidden, which is react-query's default.
export function useStats() {
  return useQuery({
    queryKey: queryKeys.emails.stats,
    queryFn: () => api.get<EmailStats>('/api/emails/stats'),
    refetchInterval: (query) => (pendingCount(query.state.data) > 0 ? BUSY_POLL_MS : IDLE_POLL_MS),
  })
}
