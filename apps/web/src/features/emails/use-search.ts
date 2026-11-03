import type { EmailTab, SearchResponse } from '@scheduler/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

export const SEARCH_DEBOUNCE_MS = 300
export const SEARCH_MIN_CHARS = 2

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function useEmailSearch(tab: EmailTab, rawQuery: string) {
  const q = rawQuery.trim()
  return useQuery({
    queryKey: queryKeys.emails.search(tab, q),
    queryFn: () =>
      api.get<SearchResponse>(`/api/emails/search?${new URLSearchParams({ q, tab }).toString()}`),
    enabled: q.length >= SEARCH_MIN_CHARS,
    placeholderData: keepPreviousData,
  })
}
