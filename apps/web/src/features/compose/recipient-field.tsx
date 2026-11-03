import { Upload } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Chip } from '../../components/ui/chip'
import { Spinner } from '../../components/ui/spinner'
import { Tooltip } from '../../components/ui/tooltip'
import { cn } from '../../lib/cn'
import { FieldRow } from './field-row'
import { parseRecipientSource, type ParsedRecipients } from './parse-recipients'
import { isValidAddress } from './schema'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const COLLAPSED_CHIPS = 3
const SEPARATORS = /[\s,;]+/

type UploadedList = ParsedRecipients & { fileName: string }

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

type RecipientFieldProps = {
  error?: string
  // Receives every address, typed and uploaded, in the order they appear as chips.
  onChange: (recipients: string[]) => void
}

export function RecipientField({ error, onChange }: RecipientFieldProps) {
  const [typed, setTyped] = useState<string[]>([])
  const [uploaded, setUploaded] = useState<UploadedList | null>(null)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const all = [...typed, ...(uploaded?.addresses ?? [])]

  function commit(nextTyped: string[], nextUploaded: UploadedList | null) {
    setTyped(nextTyped)
    setUploaded(nextUploaded)
    onChange([...nextTyped, ...(nextUploaded?.addresses ?? [])])
  }

  function addTokens(text: string) {
    const known = new Set(all)
    const fresh: string[] = []
    for (const token of text.split(SEPARATORS)) {
      const address = token.trim().toLowerCase()
      if (!address || known.has(address)) continue
      known.add(address)
      fresh.push(address)
    }
    if (fresh.length > 0) commit([...typed, ...fresh], uploaded)
  }

  function commitDraft() {
    addTokens(draft)
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ([',', ' ', ';', 'Enter'].includes(event.key)) {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && typed.length > 0) {
      commit(typed.slice(0, -1), uploaded)
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text')
    if (!SEPARATORS.test(text.trim())) return
    event.preventDefault()
    addTokens(draft + text)
    setDraft('')
  }

  function remove(address: string) {
    if (typed.includes(address)) {
      commit(
        typed.filter((item) => item !== address),
        uploaded,
      )
    } else if (uploaded) {
      commit(typed, { ...uploaded, addresses: uploaded.addresses.filter((a) => a !== address) })
    }
  }

  async function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error('That file is over 5 MB.')
      return
    }
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Upload a .csv or .txt file.')
      return
    }
    setParsing(true)
    try {
      const result = await parseRecipientSource(file, typed.filter(isValidAddress))
      if (result.addresses.length === 0) {
        toast.error('No email addresses found in that file.')
        return
      }
      commit(typed, { ...result, fileName: file.name })
    } catch {
      toast.error("Couldn't read that file.")
    } finally {
      setParsing(false)
    }
  }

  const shown = expanded ? all : all.slice(0, COLLAPSED_CHIPS)
  const hiddenCount = all.length - COLLAPSED_CHIPS

  return (
    <div>
      <FieldRow label="To" divider error={error}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5',
              expanded && 'max-h-[120px] overflow-y-auto',
            )}
          >
            {shown.map((address) =>
              isValidAddress(address) ? (
                <Chip
                  key={address}
                  onRemove={() => remove(address)}
                  removeLabel={`Remove ${address}`}
                >
                  {address}
                </Chip>
              ) : (
                <Tooltip key={address} content="This doesn't look like an email address.">
                  <span>
                    <Chip
                      tone="red"
                      onRemove={() => remove(address)}
                      removeLabel={`Remove ${address}`}
                    >
                      {address}
                    </Chip>
                  </span>
                </Tooltip>
              ),
            )}
            {hiddenCount > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
                className="inline-flex h-5 items-center rounded-full border border-chip-border bg-chip px-2 text-caption text-gray-900"
              >
                {expanded ? 'Show fewer' : `+${hiddenCount.toLocaleString()}`}
              </button>
            )}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={commitDraft}
              placeholder={all.length === 0 ? 'recipient@example.com' : ''}
              aria-label="Recipients"
              className="h-6 min-w-[140px] flex-1 bg-transparent text-small text-gray-900 outline-none placeholder:text-placeholder"
            />
          </div>
          <button
            type="button"
            disabled={parsing}
            onClick={() => fileInput.current?.click()}
            className="flex shrink-0 items-center gap-1 text-small text-brand disabled:opacity-60"
          >
            {parsing ? (
              <Spinner className="size-3.5" />
            ) : (
              <Upload aria-hidden className="size-3.5" />
            )}
            Upload List
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onFile(file)
            }}
          />
        </div>
      </FieldRow>

      {uploaded && (
        <p className="mt-1 ml-[53px] text-caption text-muted">
          {[
            plural(uploaded.addresses.length, 'address', 'addresses'),
            uploaded.duplicates > 0 &&
              `${plural(uploaded.duplicates, 'duplicate', 'duplicates')} removed`,
            uploaded.rowsWithoutEmail > 0 &&
              `${plural(uploaded.rowsWithoutEmail, 'row', 'rows')} without an email`,
            uploaded.fileName,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          <button
            type="button"
            aria-label="Remove the uploaded list"
            onClick={() => commit(typed, null)}
            className="text-gray-500 hover:text-gray-900"
          >
            ×
          </button>
        </p>
      )}
    </div>
  )
}
