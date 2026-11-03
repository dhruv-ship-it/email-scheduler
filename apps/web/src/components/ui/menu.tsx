import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({ className, ...rest }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        align="start"
        className={cn(
          'z-50 min-w-[190px] rounded-lg border border-gray-100 bg-white p-1 shadow-lg',
          'text-body text-gray-900 outline-none',
          className,
        )}
        {...rest}
      />
    </DropdownMenu.Portal>
  )
}

export function MenuItem({ className, ...rest }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 outline-none select-none',
        'data-[highlighted]:bg-surface data-[disabled]:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}

export function MenuSeparator({
  className,
  ...rest
}: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('my-1 h-px bg-gray-100', className)} {...rest} />
}

export function MenuLabel({ className, ...rest }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2.5 py-1.5 text-caption leading-4 text-muted', className)}
      {...rest}
    />
  )
}
