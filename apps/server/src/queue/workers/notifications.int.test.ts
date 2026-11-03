import { eq } from 'drizzle-orm'
import { UnrecoverableError, type Job } from 'bullmq'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slackConnections } from '../../db/schema'
import { db } from '../../lib/db'
import { upsertConnection } from '../../modules/slack/connection'
import { insertCampaign, insertSender, insertUser, waitUntil } from '../../test/fixtures'
import { cleanDatabase, flushTestRedis } from '../../test/setup-int-db'
import { closeQueues, notificationsQueue, type NotificationJobData } from '../queues'
import { processNotification, startNotificationsWorker } from './notifications'

const WEBHOOK_URL = 'https://hooks.slack.com/services/T0001/B0001/secret'
const fetchMock = vi.fn<typeof fetch>()

async function seed() {
  const user = await insertUser()
  const senderId = await insertSender()
  const campaignId = await insertCampaign(user.id, senderId)
  const data: NotificationJobData = {
    kind: 'rate-limit',
    userId: user.id,
    senderId,
    campaignId,
    windowStart: Date.UTC(2026, 10, 3, 9),
    limit: 200,
    deferredUntil: Date.UTC(2026, 10, 3, 10),
  }
  return { user, data }
}

async function connect(userId: string): Promise<void> {
  await upsertConnection({
    userId,
    teamId: 'T0001',
    teamName: 'Acme',
    channelId: 'C0001',
    channelName: 'alerts',
    webhookUrl: WEBHOOK_URL,
    accessToken: 'xoxb-secret-token',
  })
}

function jobWith(data: NotificationJobData): Job<NotificationJobData> {
  return { data } as Job<NotificationJobData>
}

async function hasConnection(userId: string): Promise<boolean> {
  const rows = await db.select().from(slackConnections).where(eq(slackConnections.userId, userId))
  return rows.length > 0
}

describe('notifications worker', () => {
  beforeEach(async () => {
    await cleanDatabase()
    await flushTestRedis()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    await closeQueues()
  })

  it('does not call slack when the user has no connection', async () => {
    const { data } = await seed()

    await processNotification(jobWith(data))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a block kit message to the stored webhook', async () => {
    const { user, data } = await seed()
    await connect(user.id)
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await processNotification(jobWith(data))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(WEBHOOK_URL)
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.blocks[0].text.text).toBe('Hourly limit reached')
    const fields = body.blocks[1].fields.map((field: { text: string }) => field.text).join('\n')
    expect(fields).toContain('200 per hour')
    expect(fields).toContain('Hello')
    expect(fields).toContain('<!date^')
    expect(await hasConnection(user.id)).toBe(true)
  })

  it.each([
    ['a 404 from slack', new Response('', { status: 404 })],
    ['a 410 from slack', new Response('', { status: 410 })],
    ['a channel_is_archived body', new Response('channel_is_archived', { status: 400 })],
    ['an invalid_token body', new Response('invalid_token', { status: 403 })],
  ])('removes the connection and gives up on %s', async (_label, response) => {
    const { user, data } = await seed()
    await connect(user.id)
    fetchMock.mockResolvedValueOnce(response)

    await expect(processNotification(jobWith(data))).rejects.toBeInstanceOf(UnrecoverableError)

    expect(await hasConnection(user.id)).toBe(false)
  })

  it.each([
    ['a 429', new Response('', { status: 429 })],
    ['a 500', new Response('', { status: 500 })],
  ])('keeps the connection and lets the job retry after %s', async (_label, response) => {
    const { user, data } = await seed()
    await connect(user.id)
    fetchMock.mockResolvedValueOnce(response)

    const error = await processNotification(jobWith(data)).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(UnrecoverableError)
    expect(await hasConnection(user.id)).toBe(true)
  })

  it('keeps the connection and lets the job retry after a network error', async () => {
    const { user, data } = await seed()
    await connect(user.id)
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const error = await processNotification(jobWith(data)).catch((err: unknown) => err)

    expect(error).not.toBeInstanceOf(UnrecoverableError)
    expect(await hasConnection(user.id)).toBe(true)
  })

  it('does not retry a job whose webhook was revoked', async () => {
    const { user, data } = await seed()
    await connect(user.id)
    fetchMock.mockResolvedValue(new Response('no_service', { status: 404 }))
    const job = await notificationsQueue.add('rate-limit', data, { jobId: 'revoked-test' })

    const worker = startNotificationsWorker()
    try {
      await waitUntil(async () => (await job.getState()) === 'failed')
    } finally {
      await worker.close()
    }

    const failed = await notificationsQueue.getJob('revoked-test')
    expect(failed?.attemptsMade).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await hasConnection(user.id)).toBe(false)
  })
})
