import { addDays, format, isValid, setHours, startOfDay } from 'date-fns'
import { CalendarDays, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Tooltip } from '../../components/ui/tooltip'
import { cn } from '../../lib/cn'

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm"

function tomorrowAt(hour: number): Date {
  return setHours(addDays(startOfDay(new Date()), 1), hour)
}

const PRESETS = [
  { label: 'Tomorrow', at: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
]

type SendLaterProps = {
  value: Date | null
  onChange: (value: Date | null) => void
}

export function SendLater({ value, onChange }: SendLaterProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  function onOpenChange(next: boolean) {
    if (next) {
      setDraft(value ? format(value, INPUT_FORMAT) : '')
      setError(null)
    }
    setOpen(next)
  }

  function apply() {
    const picked = new Date(draft)
    if (!draft || !isValid(picked)) {
      setError('Pick a date and time.')
      return
    }
    if (picked.getTime() < Date.now()) {
      setError("Pick a time that isn't in the past.")
      return
    }
    onChange(picked)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip content={value ? `Scheduled for ${format(value, 'MMM d, h:mm a')}` : 'Send later'}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            aria-label={
              value ? `Send later, set for ${format(value, 'MMM d, h:mm a')}` : 'Send later'
            }
            className={cn(value && 'text-brand hover:text-brand')}
          >
            <Clock aria-hidden className="size-4" />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[210px] p-3">
        <p className="text-body font-medium text-gray-900">Send Later</p>

        <div className="relative mt-3">
          <input
            type="datetime-local"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
            aria-label="Pick date & time"
            className="h-8 w-full border-b border-gray-200 bg-transparent pr-7 text-small text-gray-900 outline-none focus:border-brand [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
          <CalendarDays
            aria-hidden
            className="pointer-events-none absolute top-2 right-0 size-3.5 text-gray-500"
          />
        </div>
        <p className="mt-1 text-caption text-muted">{timeZone}</p>
        {error && (
          <p role="alert" className="mt-1 text-caption text-red-600">
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setDraft(format(preset.at(), INPUT_FORMAT))
                setError(null)
              }}
              className="h-[22px] rounded-md px-1 text-left text-small text-gray-700 hover:bg-surface"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="text-small text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-small text-gray-900 hover:text-gray-600"
            >
              Cancel
            </button>
            <Button variant="outline" onClick={apply}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
