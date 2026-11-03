import * as RadixPopover from '@radix-ui/react-popover'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger

export function PopoverContent({
  className,
  ...rest
}: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={8}
        align="end"
        className={cn(
          'z-50 rounded-lg border border-gray-100 bg-white p-2 text-body text-gray-900 shadow-lg outline-none',
          className,
        )}
        {...rest}
      />
    </RadixPopover.Portal>
  )
}
