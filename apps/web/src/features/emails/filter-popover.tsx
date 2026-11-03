import { TAB_FILTER_STATUSES, type EmailStatus, type EmailTab } from '@scheduler/shared'
import { Funnel } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { cn } from '../../lib/cn'

const STATUS_LABELS: Record<EmailStatus, string> = {
  scheduled: 'Scheduled',
  throttled: 'Held by limit',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

type FilterPopoverProps = {
  tab: EmailTab
  status: EmailStatus | undefined
  starred: boolean
  onStatusChange: (status: EmailStatus | undefined) => void
  onStarredChange: (starred: boolean) => void
}

export function FilterPopover({
  tab,
  status,
  starred,
  onStatusChange,
  onStarredChange,
}: FilterPopoverProps) {
  const active = status !== undefined || starred
  const options: { value: EmailStatus | undefined; label: string }[] = [
    { value: undefined, label: 'All' },
    ...TAB_FILTER_STATUSES[tab].map((value) => ({ value, label: STATUS_LABELS[value] })),
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={active ? 'Filter (active)' : 'Filter'}
          className="relative"
        >
          <Funnel aria-hidden className="size-3.5" />
          {active && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px]">
        <div role="radiogroup" aria-label="Status" className="flex flex-col">
          {options.map((option) => {
            const selected = option.value === status
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onStatusChange(option.value)}
                className={cn(
                  'flex h-8 items-center rounded-md px-2.5 text-left hover:bg-surface',
                  selected && 'bg-brand-soft font-semibold',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <div className="my-1.5 h-px bg-gray-100" />
        <button
          type="button"
          role="switch"
          aria-checked={starred}
          onClick={() => onStarredChange(!starred)}
          className="flex h-8 w-full items-center justify-between rounded-md px-2.5 hover:bg-surface"
        >
          Starred only
          <span
            className={cn(
              'flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
              starred ? 'bg-brand' : 'bg-gray-200',
            )}
          >
            <span
              className={cn(
                'size-3 rounded-full bg-white transition-transform',
                starred && 'translate-x-3',
              )}
            />
          </span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
