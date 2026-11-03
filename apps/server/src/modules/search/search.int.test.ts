import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { campaigns, emails } from '../../db/schema'
import { db } from '../../lib/db'
import { insertSender, insertUser, waitUntil } from '../../test/fixtures'
import { cleanDatabase } from '../../test/setup-int-db'
import { esClient, searchIndex } from './client'
import { ensureIndex } from './ensure-index'
import { searchEmails } from './search'
import { indexEmails } from './sync'

const TEST_ALIAS = 'emails-int-test'

// Elasticsearch is optional for a developer running the suite; without it the
// search tests are skipped rather than failed.
const reachable = await esClient
  .ping()
  .then(() => true)
  .catch(() => false)

async function dropTestIndexes(): Promise<void> {
  await esClient.indices
    .delete({ index: `${TEST_ALIAS}-*`, ignore_unavailable: true })
    .catch(() => {})
}

async function seedEmail(
  userId: string,
  senderId: string,
  subject: string,
  recipient: string,
): Promise<string> {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      userId,
      senderId,
      subject,
      bodyHtml: '<p>body</p>',
      bodyText: `Body of ${subject}`,
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 100,
      total: 1,
    })
    .returning({ id: campaigns.id })
  if (!campaign) throw new Error('seed failed')
  const [email] = await db
    .insert(emails)
    .values({
      campaignId: campaign.id,
      userId,
      senderId,
      recipient,
      seq: 0,
      status: 'scheduled',
      scheduledAt: new Date(),
      plannedAt: new Date(),
    })
    .returning({ id: emails.id })
  if (!email) throw new Error('seed failed')
  return email.id
}

describe.skipIf(!reachable)('email search', () => {
  const originalAlias = searchIndex.alias

  beforeAll(async () => {
    searchIndex.alias = TEST_ALIAS
    await dropTestIndexes()
    await ensureIndex()
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await dropTestIndexes()
    searchIndex.alias = originalAlias
  })

  it('finds an email by a prefix of its subject, with the match highlighted', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    const ids = [
      await seedEmail(user.id, senderId, 'Quarterly report', 'ann@example.com'),
      await seedEmail(user.id, senderId, 'Welcome aboard', 'bob@example.com'),
      await seedEmail(user.id, senderId, 'Invoice reminder', 'cy@example.com'),
    ]
    await indexEmails(ids)
    await esClient.indices.refresh({ index: TEST_ALIAS })

    const result = await searchEmails({ userId: user.id, q: 'quart', tab: 'all' })

    expect(result.engine).toBe('elasticsearch')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ id: ids[0], subject: 'Quarterly report' })
    expect(result.items[0]?.highlights?.subject).toContain('<mark>')
  })

  it('never returns another user email', async () => {
    const owner = await insertUser('owner@example.com')
    const other = await insertUser('other@example.com')
    const senderId = await insertSender()
    const id = await seedEmail(owner.id, senderId, 'Private plans', 'ann@example.com')
    await indexEmails([id])
    await esClient.indices.refresh({ index: TEST_ALIAS })

    const result = await searchEmails({ userId: other.id, q: 'private', tab: 'all' })

    expect(result.items).toHaveLength(0)
  })

  it('falls back to postgres when the index is missing', async () => {
    const user = await insertUser()
    const senderId = await insertSender()
    await seedEmail(user.id, senderId, 'Fallback subject', 'ann@example.com')
    searchIndex.alias = 'emails-int-test-missing'
    try {
      await waitUntil(
        async () => !(await esClient.indices.existsAlias({ name: searchIndex.alias })),
      )
      const result = await searchEmails({ userId: user.id, q: 'fallback', tab: 'all' })

      expect(result.engine).toBe('postgres')
      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.subject).toBe('Fallback subject')
    } finally {
      searchIndex.alias = TEST_ALIAS
    }
  })
})
