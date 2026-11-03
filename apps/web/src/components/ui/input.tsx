import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type InputVariant = 'filled' | 'line' | 'box'

const VARIANTS: Record<InputVariant, string> = {
  // Login fields.
  filled:
    'h-11 w-full rounded-lg bg-surface px-4 text-caption text-gray-900 placeholder:text-gray-500',
  // Compose subject: no chrome, the row's divider does the work.
  line: 'h-8 w-full bg-transparent text-small text-gray-900 placeholder:text-placeholder',
  // The small number boxes for delay and hourly limit.
  box: 'h-[22px] w-[42px] rounded-md border border-gray-200 bg-white text-center text-caption text-gray-900 placeholder:text-placeholder',
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { variant?: InputVariant }

export function Input({ variant = 'filled', className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        'outline-none',
        variant === 'line'
          ? 'focus-visible:outline-none'
          : 'focus-visible:ring-2 focus-visible:ring-brand/40',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}
