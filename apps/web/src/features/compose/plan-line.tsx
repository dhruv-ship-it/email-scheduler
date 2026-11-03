import { planSendTimes, summarizePlan } from '@scheduler/shared'
import { format, isSameDay } from 'date-fns'
import { useMemo } from 'react'

const MAX_BARS = 12

function formatPlanTime(ms: number): string {
  const date = new Date(ms)
  return isSameDay(date, new Date()) ? format(date, 'h:mm aaa') : format(date, 'EEE h:mm aaa')
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000)
  if (totalMinutes < 1) return `${Math.max(1, Math.round(ms / 1000))} s`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} m`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} m`
}

type PlanLineProps = {
  count: number
  startAt: Date | null
  delaySeconds: number
  hourlyLimit: number
  minDelaySeconds: number
  senderCap: number | null
  windowMs: number
}

export function PlanLine({
  count,
  startAt,
  delaySeconds,
  hourlyLimit,
  minDelaySeconds,
  senderCap,
  windowMs,
}: PlanLineProps) {
  const usable =
    count > 0 && Number.isFinite(delaySeconds) && Number.isFinite(hourlyLimit) && hourlyLimit >= 1

  // The sender's own cap and the minimum interval apply no matter what was typed, so
  // the preview uses what will really happen.
  const effectiveLimit = senderCap === null ? hourlyLimit : Math.min(hourlyLimit, senderCap)
  const effectiveDelay = Math.max(delaySeconds, minDelaySeconds)

  const summary = useMemo(() => {
    if (!usable) return null
    const times = planSendTimes({
      count,
      startAt: startAt ? startAt.getTime() : Date.now(),
      delayMs: effectiveDelay * 1000,
      hourlyLimit: effectiveLimit,
      windowMs,
    })
    return summarizePlan(times, windowMs)
  }, [usable, count, startAt, effectiveDelay, effectiveLimit, windowMs])

  if (!summary || summary.lastAt === null) return null

  const capped = senderCap !== null && hourlyLimit > senderCap
  const peak = Math.max(...summary.windows.map((window) => window.count))
  const bars = summary.windows.slice(0, MAX_BARS)
  const extraWindows = summary.windows.length - bars.length

  const parts = [
    `First send ${startAt ? formatPlanTime(startAt.getTime()) : 'now'}`,
    ...(count > 1 ? [`last ≈ ${formatPlanTime(summary.lastAt)}`] : []),
    `${count.toLocaleString()} ${count === 1 ? 'email' : 'emails'}${
      summary.durationMs > 0 ? ` over ${formatDuration(summary.durationMs)}` : ''
    } in ${summary.windows.length} hourly ${summary.windows.length === 1 ? 'window' : 'windows'}`,
  ]

  return (
    <div className="mt-2 text-small text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>{parts.join(' · ')}</p>
        <div aria-hidden className="flex h-4 items-end gap-0.5">
          {bars.map((window) => (
            <span
              key={window.start}
              style={{ height: `${Math.max(3, Math.round((window.count / peak) * 16))}px` }}
              className="w-1.5 rounded-sm bg-brand/60"
            />
          ))}
          {extraWindows > 0 && <span className="pl-1 text-caption">+{extraWindows}</span>}
        </div>
      </div>
      {capped && (
        <p className="mt-0.5 text-amber-600">
          This sender is capped at {senderCap}/hour, so that&apos;s the real limit.
        </p>
      )}
    </div>
  )
}
