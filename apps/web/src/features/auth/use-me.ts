import type { Me } from '@scheduler/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

// null means "signed out", which the guards treat differently from a failed request.
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api.get<Me>('/api/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/api/auth/logout'),
    onSuccess: () => {
      // Drop the previous user's lists before the next sign-in can see them.
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] })
      client.setQueryData(queryKeys.me, null)
    },
  })
}
