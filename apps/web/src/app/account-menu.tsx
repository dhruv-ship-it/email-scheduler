import type { Me } from '@scheduler/shared'
import { ArrowUpRight, ChevronDown, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Avatar } from '../components/ui/avatar'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/ui/menu'
import { useLogout } from '../features/auth/use-me'
import { SlackMenuSection } from '../features/slack/slack-menu-section'
import { startTour } from '../features/tour/tour'

export function AccountMenu({ me }: { me: Me }) {
  const logout = useLogout()
  const navigate = useNavigate()

  function onLogout() {
    logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          data-tour="user-card"
          className="flex h-[43px] w-full items-center gap-2 rounded-lg bg-surface px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Avatar name={me.name} src={me.avatarUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body leading-4 font-medium text-gray-900">
              {me.name}
            </span>
            <span className="block truncate text-micro leading-3 text-muted">{me.email}</span>
          </span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <SlackMenuSection />
        <MenuItem asChild>
          <a href="/api/admin/queues" target="_blank" rel="noreferrer noopener">
            Queue dashboard
            <ArrowUpRight aria-hidden className="size-3 text-gray-500" />
          </a>
        </MenuItem>
        <MenuItem
          onSelect={() => {
            // Let the menu finish closing so it isn't left open over the highlighted step.
            setTimeout(startTour, 100)
          }}
        >
          Replay tour
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={onLogout}>
          <LogOut aria-hidden className="size-3.5 text-gray-500" />
          Log out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
