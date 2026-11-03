import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type ChipProps = {
  tone?: 'green' | 'red'
  onRemove?: () => void
  removeLabel?: string
  children: ReactNode
}

export function Chip({ tone = 'green', onRemove, removeLabel, children }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 rounded-full border px-2 text-caption',
        tone === 'green'
          ? 'border-chip-border bg-chip text-gray-900'
          : 'border-red-200 bg-red-50 text-[#c10007]',
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel ?? 'Remove'}
          onClick={onRemove}
          className="-mr-1 flex size-3.5 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/10 hover:text-gray-900"
        >
          <X aria-hidden className="size-2.5" />
        </button>
      )}
    </span>
  )
}
