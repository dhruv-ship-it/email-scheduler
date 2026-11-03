import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type FieldRowProps = {
  label: string
  divider?: boolean
  error?: string
  children: ReactNode
}

export function FieldRow({ label, divider, error, children }: FieldRowProps) {
  return (
    <div>
      <div
        className={cn('flex min-h-[35px] items-start gap-3', divider && 'border-b border-gray-100')}
      >
        <span className="w-[41px] shrink-0 pt-[9px] text-small text-label">{label}</span>
        <div className="flex min-w-0 flex-1 items-center self-center">{children}</div>
      </div>
      {error && (
        <p role="alert" className="mt-1 ml-[53px] text-caption text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
