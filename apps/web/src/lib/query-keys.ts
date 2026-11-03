import type { EmailStatus, EmailTab } from '@scheduler/shared'

export const queryKeys = {
  me: ['me'] as const,
  senders: ['senders'] as const,
  limits: ['limits'] as const,
  slack: ['slack'] as const,
  emails: {
    all: ['emails'] as const,
    stats: ['emails', 'stats'] as const,
    lists: ['emails', 'list'] as const,
    list: (tab: EmailTab, status: EmailStatus | undefined, starred: boolean) =>
      ['emails', 'list', tab, { status: status ?? null, starred }] as const,
    search: (tab: EmailTab, q: string) => ['emails', 'search', tab, q] as const,
    detail: (id: string) => ['emails', 'detail', id] as const,
  },
}
