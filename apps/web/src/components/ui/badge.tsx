import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'orange' | 'yellow' | 'blue' | 'gray' | 'red'

const TONES: Record<BadgeTone, string> = {
  orange: 'border-orange-200 bg-orange-100 text-orange-700',
  yellow: 'border-yellow-200 bg-[#fef9c2] text-[#a65f00]',
  blue: 'border-blue-100 bg-blue-50 text-[#1447e6]',
  gray: 'border-gray-200 bg-gray-100 text-gray-600',
  red: 'border-red-100 bg-red-50 text-[#c10007]',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone: BadgeTone }

export function Badge({ tone, className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-caption font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  )
}
