import { TAB_FILTER_STATUSES, type EmailDetail } from '@scheduler/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { BUSY_POLL_MS } from './use-stats'

export function useEmailDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.emails.detail(id ?? ''),
    queryFn: () => api.get<EmailDetail>(`/api/emails/${id}`),
    enabled: Boolean(id),
    // An email still on its way keeps changing, and the timeline should follow it.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TAB_FILTER_STATUSES.scheduled.includes(status) ? BUSY_POLL_MS : false
    },
  })
}

export function useCancelEmail(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>(`/api/emails/${id}/cancel`),
    onSuccess: () => {
      toast.success('Cancelled.')
      void client.invalidateQueries({ queryKey: queryKeys.emails.all })
    },
    onError: (error) => toast.error(error.message),
  })
}
