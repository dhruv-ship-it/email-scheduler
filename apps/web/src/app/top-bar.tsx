import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Button } from '../components/ui/button'
import { cn } from '../lib/cn'
import { queryKeys } from '../lib/query-keys'

type TopBarProps = {
  search: string
  onSearchChange: (value: string) => void
  searchRef?: Ref<HTMLInputElement>
  // The filter control sits between the search pill and refresh, as in the design.
  children?: ReactNode
}

export function TopBar({ search, onSearchChange, searchRef, children }: TopBarProps) {
  const client = useQueryClient()
  const fetching = useIsFetching({ queryKey: queryKeys.emails.all }) > 0

  return (
    <div className="flex items-center gap-3 px-3 pt-[7px]">
      <label
        data-tour="search"
        className="flex h-[30px] w-full max-w-[530px] items-center gap-2 rounded-full bg-surface px-3 focus-within:ring-2 focus-within:ring-brand/40"
      >
        <Search aria-hidden className="size-3.5 shrink-0 text-gray-500" />
        <input
          ref={searchRef}
          data-search-input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onSearchChange('')
              event.currentTarget.blur()
            }
          }}
          placeholder="Search"
          aria-label="Search emails"
          className="min-w-0 flex-1 bg-transparent text-small text-gray-900 outline-none placeholder:text-gray-500"
        />
      </label>
      {children}
      <Button
        variant="ghost"
        aria-label="Refresh"
        onClick={() => void client.invalidateQueries({ queryKey: queryKeys.emails.all })}
      >
        <RefreshCw aria-hidden className={cn('size-3.5', fetching && 'animate-spin')} />
      </Button>
    </div>
  )
}
