import * as RadixDialog from '@radix-ui/react-dialog'
import { Button } from './button'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  loading?: boolean
  onConfirm: () => void
}

// Dialogs are only used to confirm something that can't be undone.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-gray-900/30" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[360px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-100 bg-white p-5 shadow-lg outline-none">
          <RadixDialog.Title className="text-body font-semibold text-gray-900">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-1.5 text-body text-gray-600">
            {description}
          </RadixDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <RadixDialog.Close asChild>
              <Button variant="outline" disabled={loading}>
                {cancelLabel}
              </Button>
            </RadixDialog.Close>
            <Button
              variant="solid"
              className="h-[27px] rounded-full"
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
