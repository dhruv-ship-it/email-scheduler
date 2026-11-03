import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRow } from '../../db/schema'
import { ApiError } from '../../lib/errors'

const { createCampaign } = vi.hoisted(() => ({ createCampaign: vi.fn() }))
vi.mock('./create-campaign', () => ({ createCampaign }))

const { findUserById } = vi.hoisted(() => ({ findUserById: vi.fn() }))
vi.mock('../auth/users', () => ({
  findUserById,
  upsertGoogleUser: vi.fn(),
  toMe: (user: UserRow) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }),
}))

const { createApp } = await import('../../http/app')
const { signSession } = await import('../auth/session')

function fakeUser(): UserRow {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    email: 'dev@example.com',
    name: 'Dev User',
    avatarUrl: null,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  }
}

function validBody(): Record<string, unknown> {
  return {
    senderId: '11111111-1111-4111-8111-111111111111',
    subject: 'Hello',
    bodyHtml: '<p>hi</p>',
    startAt: new Date(Date.now() + 60_000).toISOString(),
    delaySeconds: 2,
    hourlyLimit: 100,
    recipients: ['a@example.com'],
  }
}

async function post(body: Record<string, unknown>) {
  const token = await signSession('user-1')
  return request(createApp())
    .post('/api/campaigns')
    .set('Content-Type', 'application/json')
    .set('Cookie', `sid=${token}`)
    .send(body)
}

describe('POST /api/campaigns validation', () => {
  beforeEach(() => {
    createCampaign.mockReset()
    findUserById.mockResolvedValue(fakeUser())
  })

  it('returns 401 with no session', async () => {
    const res = await request(createApp())
      .post('/api/campaigns')
      .set('Content-Type', 'application/json')
      .send(validBody())
    expect(res.status).toBe(401)
    expect(createCampaign).not.toHaveBeenCalled()
  })

  it('rejects an empty subject', async () => {
    const res = await post({ ...validBody(), subject: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_failed')
    expect(createCampaign).not.toHaveBeenCalled()
  })

  it('rejects a sender id that is not a uuid', async () => {
    const res = await post({ ...validBody(), senderId: 'not-a-uuid' })
    expect(res.status).toBe(400)
    expect(createCampaign).not.toHaveBeenCalled()
  })

  it('rejects a startAt more than a minute in the past', async () => {
    const res = await post({
      ...validBody(),
      startAt: new Date(Date.now() - 3_600_000).toISOString(),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a startAt more than 30 days out', async () => {
    const res = await post({
      ...validBody(),
      startAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(res.status).toBe(400)
  })

  it('rejects zero recipients', async () => {
    const res = await post({ ...validBody(), recipients: [] })
    expect(res.status).toBe(400)
  })

  it('rejects an hourly limit of zero', async () => {
    const res = await post({ ...validBody(), hourlyLimit: 0 })
    expect(res.status).toBe(400)
  })

  it('parses the body and forwards it with the signed-in user, returning 201', async () => {
    createCampaign.mockResolvedValue({
      campaignId: 'c1',
      accepted: 1,
      duplicates: 0,
      invalid: 0,
      firstSendAt: new Date().toISOString(),
      lastSendAt: new Date().toISOString(),
      queued: true,
    })
    const res = await post(validBody())
    expect(res.status).toBe(201)
    expect(res.body.campaignId).toBe('c1')
    expect(createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', subject: 'Hello' }),
    )
  })

  it('passes through the status from an ApiError thrown by createCampaign', async () => {
    createCampaign.mockRejectedValue(new ApiError('not_found', "That sender doesn't exist."))
    const res = await post(validBody())
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })
})
