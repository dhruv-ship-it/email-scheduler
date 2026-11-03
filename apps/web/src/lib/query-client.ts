import { QueryClient } from '@tanstack/react-query'

// A module-level instance so lib/api.ts can invalidate the session query on a 401
// without every caller having to pass a client around.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
})
