import type { Sender } from '@scheduler/shared'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'

type SenderSelectProps = {
  senders: Sender[]
  value: string
  onChange: (senderId: string) => void
}

export function SenderSelect({ senders, value, onChange }: SenderSelectProps) {
  const selected = senders.find((sender) => sender.id === value)

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="Send from"
          className="flex h-[26px] items-center gap-1.5 rounded-full bg-neutral-100 pr-2 pl-3 text-small text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {selected ? selected.email : 'Choose a sender'}
          <ChevronDown aria-hidden className="size-3 text-gray-500" />
        </button>
      </MenuTrigger>
      <MenuContent className="min-w-[280px]">
        {senders.map((sender) => (
          <MenuItem key={sender.id} onSelect={() => onChange(sender.id)}>
            <span className="flex-1 truncate">
              {sender.email} · {sender.hourlyLimit}/hour
            </span>
            {sender.id === value && <Check aria-hidden className="size-3.5 text-brand" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
