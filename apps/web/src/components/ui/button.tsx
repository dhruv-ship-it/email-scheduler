import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './spinner'

export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost'

const VARIANTS: Record<ButtonVariant, string> = {
  solid: 'h-[38px] rounded-lg bg-brand px-4 text-white hover:bg-green-700',
  soft: 'h-[38px] rounded-lg bg-brand-soft px-4 text-gray-900 hover:bg-green-100',
  outline: 'h-[27px] rounded-full border border-brand bg-white px-4 text-brand hover:bg-brand-soft',
  ghost: 'size-8 rounded-full text-gray-500 hover:bg-surface hover:text-gray-900',
}

// Exported so links that navigate (Compose, empty-state actions) look like buttons.
export function buttonStyles(variant: ButtonVariant, className?: string): string {
  return cn(
    'inline-flex items-center justify-center gap-2 text-body font-normal transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:opacity-60',
    VARIANTS[variant],
    className,
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  loading?: boolean
}

export function Button({
  variant = 'solid',
  loading = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
