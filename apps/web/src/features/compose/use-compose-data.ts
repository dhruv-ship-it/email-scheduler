import type {
  CreateCampaignInput,
  CreateCampaignResult,
  LimitsConfig,
  Sender,
} from '@scheduler/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders,
    queryFn: () => api.get<Sender[]>('/api/senders'),
    staleTime: 60_000,
  })
}

export function useLimits() {
  return useQuery({
    queryKey: queryKeys.limits,
    queryFn: () => api.get<LimitsConfig>('/api/config/limits'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateCampaign() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      api.post<CreateCampaignResult>('/api/campaigns', input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.emails.all }),
  })
}
