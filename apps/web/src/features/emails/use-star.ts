import type { EmailListItem } from '@scheduler/shared'
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

type Page = { items: EmailListItem[]; nextCursor?: string | null }

// Lists are infinite queries, search results are a flat page and the detail view is
// one item, so the optimistic patch has to recognise each cached shape.
function withStar(data: unknown, id: string, starred: boolean): unknown {
  if (!data || typeof data !== 'object') return data
  const patchItems = (items: EmailListItem[]) =>
    items.map((item) => (item.id === id ? { ...item, starred } : item))

  if ('pages' in data) {
    const infinite = data as InfiniteData<Page>
    return {
      ...infinite,
      pages: infinite.pages.map((page) => ({ ...page, items: patchItems(page.items) })),
    }
  }
  if ('items' in data) {
    const page = data as Page
    return { ...page, items: patchItems(page.items) }
  }
  if ('id' in data && (data as EmailListItem).id === id) return { ...data, starred }
  return data
}

export function useToggleStar() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch<EmailListItem>(`/api/emails/${id}`, { starred }),
    onMutate: async ({ id, starred }) => {
      await client.cancelQueries({ queryKey: queryKeys.emails.all })
      const snapshots = client.getQueriesData({ queryKey: queryKeys.emails.all })
      for (const [key, data] of snapshots) {
        client.setQueryData(key, withStar(data, id, starred))
      }
      return { snapshots }
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) client.setQueryData(key, data)
      toast.error("Couldn't update the star. Try again.")
    },
    onSettled: () => {
      // A starred-only list has to drop a row that was just unstarred.
      void client.invalidateQueries({ queryKey: queryKeys.emails.lists })
    },
  })
}
