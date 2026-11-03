import { Clock, Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { buttonStyles } from '../components/ui/button'
import { useMe } from '../features/auth/use-me'
import { pendingCount, sentCount, useStats } from '../features/emails/use-stats'
import { useSlackReturnToast } from '../features/slack/use-slack'
import { cn } from '../lib/cn'
import { AccountMenu } from './account-menu'

type NavRowProps = { to: string; icon: ReactNode; label: string; count: number | null }

function NavRow({ to, icon, label, count }: NavRowProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-7 items-center gap-2.5 rounded-lg px-3.5 text-body text-gray-700 hover:bg-surface',
          isActive && 'bg-brand-soft font-semibold text-gray-900 hover:bg-brand-soft',
        )
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {count !== null && (
        <span className="text-caption font-normal text-muted tabular-nums">
          {count.toLocaleString()}
        </span>
      )}
    </NavLink>
  )
}

export function AppShell() {
  const me = useMe().data
  const stats = useStats().data
  useSlackReturnToast()

  return (
    <div className="flex h-screen min-w-[960px]">
      <aside className="flex w-[210px] shrink-0 flex-col gap-2 px-2.5 pt-1.5">
        <p className="h-6 px-1 text-title leading-6 font-bold tracking-tight text-gray-900">
          Email Scheduler
        </p>
        {me && <AccountMenu me={me} />}
        <Link to="/compose" data-tour="compose" className={buttonStyles('outline', 'w-full')}>
          Compose
        </Link>
        <div className="mt-2.5">
          <p className="px-3.5 pb-px text-caption leading-3.5 tracking-wide text-faint uppercase">
            Core
          </p>
          <nav data-tour="nav" className="flex flex-col gap-0.5">
            <NavRow
              to="/scheduled"
              icon={<Clock aria-hidden className="size-3.5" />}
              label="Scheduled"
              count={stats ? pendingCount(stats) : null}
            />
            <NavRow
              to="/sent"
              icon={<Send aria-hidden className="size-3.5" />}
              label="Sent"
              count={stats ? sentCount(stats) : null}
            />
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
