import { zodResolver } from '@hookform/resolvers/zod'
import type { CreateCampaignInput } from '@scheduler/shared'
import { format, isSameDay } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { FieldRow } from '../features/compose/field-row'
import { PlanLine } from '../features/compose/plan-line'
import { RecipientField } from '../features/compose/recipient-field'
import { RichEditor } from '../features/compose/rich-editor'
import { composeSchema, type ComposeValues } from '../features/compose/schema'
import { SendLater } from '../features/compose/send-later'
import { SenderSelect } from '../features/compose/sender-select'
import { useCreateCampaign, useLimits, useSenders } from '../features/compose/use-compose-data'
import { useGoBack } from '../lib/use-go-back'

const DEFAULT_MIN_INTERVAL_MS = 2000
const DEFAULT_WINDOW_MS = 3_600_000

const HINTS = {
  delay: 'Seconds between two emails',
  limit: 'Most emails per hour for this campaign',
} as const

function formatFirstSend(iso: string): string {
  const date = new Date(iso)
  return isSameDay(date, new Date()) ? format(date, 'h:mm aaa') : format(date, 'EEE h:mm aaa')
}

export function ComposePage() {
  const goBack = useGoBack('/scheduled')
  const navigate = useNavigate()
  const sendersQuery = useSenders()
  const senders = sendersQuery.data
  const limits = useLimits().data
  const create = useCreateCampaign()
  const [hint, setHint] = useState<string | null>(null)
  const submitted = useRef(false)

  const minDelaySeconds = Math.ceil((limits?.minSendIntervalMs ?? DEFAULT_MIN_INTERVAL_MS) / 1000)
  const schema = useMemo(() => composeSchema(minDelaySeconds), [minDelaySeconds])

  const {
    control,
    register,
    setValue,
    getValues,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ComposeValues>({
    resolver: zodResolver(schema),
    defaultValues: { senderId: '', recipients: [], subject: '', bodyHtml: '', startAt: null },
  })

  const [senderId, recipients, startAt, delaySeconds, hourlyLimit] = useWatch({
    control,
    name: ['senderId', 'recipients', 'startAt', 'delaySeconds', 'hourlyLimit'],
  })
  const sender = senders?.find((item) => item.id === senderId)

  const firstSenderId = senders?.[0]?.id
  useEffect(() => {
    if (firstSenderId && !getValues('senderId')) setValue('senderId', firstSenderId)
  }, [firstSenderId, getValues, setValue])

  function onSubmit(values: ComposeValues) {
    const input: CreateCampaignInput = {
      senderId: values.senderId,
      subject: values.subject.trim(),
      bodyHtml: values.bodyHtml,
      startAt: (values.startAt ?? new Date()).toISOString(),
      delaySeconds: values.delaySeconds,
      hourlyLimit: values.hourlyLimit,
      recipients: values.recipients,
    }
    create.mutate(input, {
      onSuccess: (result) => {
        submitted.current = true
        const count = result.accepted.toLocaleString()
        const noun = result.accepted === 1 ? 'email' : 'emails'
        if (result.queued) {
          toast.success(
            `Scheduled ${count} ${noun}. The first one goes out at ${formatFirstSend(result.firstSendAt)}.`,
          )
        } else {
          toast.warning(
            `Saved ${count} ${noun}, but queueing is delayed. They will go out once the queue catches up.`,
          )
        }
        void navigate('/scheduled')
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const submit = handleSubmit(onSubmit)

  // Latest handler without re-subscribing the key listener on every render.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!create.isPending) void submitRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [create.isPending])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !submitted.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const delayField = register('delaySeconds', { valueAsNumber: true })
  const limitField = register('hourlyLimit', { valueAsNumber: true })

  return (
    <div className="min-h-screen pb-16">
      <header className="flex h-[54px] items-center gap-3 px-5">
        <Button variant="ghost" aria-label="Back" onClick={goBack}>
          <ArrowLeft aria-hidden className="size-4" />
        </Button>
        <h1 className="flex-1 text-title text-gray-900">Compose New Email</h1>
        <Controller
          control={control}
          name="startAt"
          render={({ field }) => <SendLater value={field.value} onChange={field.onChange} />}
        />
        <Button
          variant="outline"
          className="h-6 px-3.5 text-small"
          loading={create.isPending}
          onClick={() => void submit()}
        >
          {startAt ? 'Send Later' : 'Send'}
        </Button>
      </header>

      <form
        onSubmit={(event) => event.preventDefault()}
        className="mt-4 ml-[120px] flex w-[630px] max-w-full flex-col gap-1"
        noValidate
      >
        <FieldRow label="From" error={errors.senderId?.message}>
          <Controller
            control={control}
            name="senderId"
            render={({ field }) => (
              <SenderSelect senders={senders ?? []} value={field.value} onChange={field.onChange} />
            )}
          />
        </FieldRow>

        <Controller
          control={control}
          name="recipients"
          render={({ field }) => (
            <RecipientField error={errors.recipients?.message} onChange={field.onChange} />
          )}
        />

        <FieldRow label="Subject" divider error={errors.subject?.message}>
          <Input variant="line" placeholder="Subject" {...register('subject')} />
        </FieldRow>

        <div className="pt-1.5">
          <div className="flex items-center gap-[18px] text-small text-label">
            <label className="flex items-center gap-2.5">
              Delay between 2 emails
              <Input
                variant="box"
                type="number"
                inputMode="numeric"
                placeholder="00"
                {...delayField}
                onFocus={() => setHint(HINTS.delay)}
                onBlur={(event) => {
                  void delayField.onBlur(event)
                  setHint(null)
                }}
              />
            </label>
            <label className="flex items-center gap-2.5">
              Hourly Limit
              <Input
                variant="box"
                type="number"
                inputMode="numeric"
                placeholder="00"
                {...limitField}
                onFocus={() => setHint(HINTS.limit)}
                onBlur={(event) => {
                  void limitField.onBlur(event)
                  setHint(null)
                }}
              />
            </label>
          </div>
          {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
          {[errors.delaySeconds?.message, errors.hourlyLimit?.message, errors.startAt?.message]
            .filter(Boolean)
            .map((message) => (
              <p key={message} role="alert" className="mt-1 text-caption text-red-600">
                {message}
              </p>
            ))}
          <PlanLine
            count={recipients.length}
            startAt={startAt}
            delaySeconds={delaySeconds}
            hourlyLimit={hourlyLimit}
            minDelaySeconds={minDelaySeconds}
            senderCap={sender?.hourlyLimit ?? null}
            windowMs={limits?.windowMs ?? DEFAULT_WINDOW_MS}
          />
        </div>

        <div className="mt-3">
          <Controller
            control={control}
            name="bodyHtml"
            render={({ field }) => <RichEditor onChange={field.onChange} />}
          />
          {errors.bodyHtml?.message && (
            <p role="alert" className="mt-1 text-caption text-red-600">
              {errors.bodyHtml.message}
            </p>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Discard this draft?"
        description="What you've written here won't be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  )
}
