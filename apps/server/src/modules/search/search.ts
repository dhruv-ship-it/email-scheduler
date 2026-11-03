import type { EmailListItem, SearchResponse } from '@scheduler/shared'
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { campaigns, emails, senders } from '../../db/schema'
import { db } from '../../lib/db'
import { logger } from '../../lib/logger'
import { listSelection, toListItem } from '../emails/list'
import { esClient, searchIndex } from './client'
import { buildSearchBody, escapeLike, statusesForSearchTab, type SearchTab } from './query'

const DEFAULT_LIMIT = 20

type SearchArgs = { userId: string; q: string; tab: SearchTab; limit?: number }
type Highlights = NonNullable<SearchResponse['items'][number]['highlights']>

async function loadItems(userId: string, ids: string[]): Promise<Map<string, EmailListItem>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select(listSelection)
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(and(eq(emails.userId, userId), inArray(emails.id, ids)))
  return new Map(rows.map((row) => [row.email.id, toListItem(row)]))
}

function pickHighlights(raw: Record<string, string[]> | undefined): Highlights | undefined {
  if (!raw) return undefined
  const picked: Highlights = {}
  const subject = raw.subject?.[0]
  const recipient = raw.recipient?.[0] ?? raw['recipient.email']?.[0]
  const bodyText = raw.bodyText?.[0]
  if (subject) picked.subject = subject
  if (recipient) picked.recipient = recipient
  if (bodyText) picked.bodyText = bodyText
  return Object.keys(picked).length > 0 ? picked : undefined
}

async function searchElasticsearch(args: Required<SearchArgs>): Promise<SearchResponse> {
  const response = await esClient.search(
    {
      // Without an explicit index Elasticsearch searches every index on the cluster.
      index: searchIndex.alias,
      ...buildSearchBody({
        userId: args.userId,
        q: args.q,
        statuses: statusesForSearchTab(args.tab),
        limit: args.limit,
      }),
    },
    { requestTimeout: 2000 },
  )
  // Elasticsearch decides what matches and in which order; Postgres supplies the
  // current row, so a status that changed since indexing is never shown stale.
  const hits = response.hits.hits
  const items = await loadItems(
    args.userId,
    hits.map((hit) => hit._id as string),
  )
  const ordered = hits.flatMap((hit) => {
    const item = items.get(hit._id as string)
    if (!item) return []
    const highlights = pickHighlights(hit.highlight)
    return [highlights ? { ...item, highlights } : item]
  })
  const total = response.hits.total
  return {
    engine: 'elasticsearch',
    total: typeof total === 'number' ? total : (total?.value ?? ordered.length),
    items: ordered,
  }
}

async function searchPostgres(args: Required<SearchArgs>): Promise<SearchResponse> {
  const pattern = `%${escapeLike(args.q)}%`
  const rows = await db
    .select(listSelection)
    .from(emails)
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(
      and(
        eq(emails.userId, args.userId),
        inArray(emails.status, [...statusesForSearchTab(args.tab)]),
        or(ilike(emails.recipient, pattern), ilike(campaigns.subject, pattern)),
      ),
    )
    .orderBy(desc(emails.scheduledAt))
    .limit(args.limit)
  const items = rows.map(toListItem)
  return { engine: 'postgres', total: items.length, items }
}

export async function searchEmails(args: SearchArgs): Promise<SearchResponse> {
  const full = { ...args, limit: args.limit ?? DEFAULT_LIMIT }
  try {
    return await searchElasticsearch(full)
  } catch (err) {
    // Any failure here (down, slow, index missing) just means "use the database".
    logger.warn({ err, alias: searchIndex.alias }, 'search fell back to postgres')
    return searchPostgres(full)
  }
}
