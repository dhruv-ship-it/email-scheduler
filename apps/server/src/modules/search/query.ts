import { EMAIL_STATUSES, TAB_DEFAULT_STATUSES, type EmailStatus } from '@scheduler/shared'
import type { estypes } from '@elastic/elasticsearch'

export const SEARCH_TABS = ['scheduled', 'sent', 'all'] as const
export type SearchTab = (typeof SEARCH_TABS)[number]

export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 100

export function statusesForSearchTab(tab: SearchTab): readonly EmailStatus[] {
  return tab === 'all' ? EMAIL_STATUSES : TAB_DEFAULT_STATUSES[tab]
}

type SearchBodyArgs = {
  userId: string
  q: string
  statuses: readonly EmailStatus[]
  limit: number
}

// bool_prefix lets a half-typed word or address match, which is what search-as-you-type
// needs. The user filter is a hard filter, so one user can never see another's mail.
export function buildSearchBody({
  userId,
  q,
  statuses,
  limit,
}: SearchBodyArgs): estypes.SearchRequest {
  return {
    size: limit,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ term: { userId } }, { terms: { status: [...statuses] } }],
        must: [
          {
            multi_match: {
              query: q,
              type: 'bool_prefix',
              fields: ['recipient.email^3', 'recipient^2', 'subject^2', 'bodyText'],
            },
          },
        ],
      },
    },
    highlight: {
      encoder: 'html',
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      fields: {
        subject: {},
        recipient: {},
        'recipient.email': {},
        bodyText: { fragment_size: 120, number_of_fragments: 1 },
      },
    },
    sort: ['_score', { scheduledAt: 'desc' }],
  }
}

// Escapes the characters LIKE treats as wildcards, so a search for "50%" means 50%.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}
