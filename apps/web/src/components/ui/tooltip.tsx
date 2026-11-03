import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = RadixTooltip.Provider

type TooltipProps = { content: ReactNode; children: ReactNode }

export function Tooltip({ content, children }: TooltipProps) {
  if (!content) return children
  return (
    <RadixTooltip.Root delayDuration={200}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 max-w-[260px] rounded-md bg-gray-900 px-2.5 py-1.5 text-caption leading-4 text-white"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
