import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRow } from '../../db/schema'
import { createApp } from '../../http/app'
import { signSession } from './session'

const { findUserById } = vi.hoisted(() => ({ findUserById: vi.fn() }))

vi.mock('./users', () => ({
  findUserById,
  upsertGoogleUser: vi.fn(),
  toMe: (user: UserRow) => ({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }),
}))

function fakeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    googleSub: 'sub-1',
    email: 'dev@example.com',
    name: 'Dev User',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: new Date(),
    lastLoginAt: new Date(),
    ...overrides,
  }
}

describe('requireAuth and /api/me', () => {
  beforeEach(() => {
    findUserById.mockReset()
  })

  it('returns 401 with no session cookie', async () => {
    const res = await request(createApp()).get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('returns 401 for a tampered session cookie', async () => {
    const token = await signSession('user-1')
    const res = await request(createApp())
      .get('/api/me')
      .set('Cookie', `sid=${token}tampered`)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the session points at a user that no longer exists', async () => {
    findUserById.mockResolvedValue(undefined)
    const token = await signSession('deleted-user')
    const res = await request(createApp())
      .get('/api/me')
      .set('Cookie', `sid=${token}`)
    expect(res.status).toBe(401)
  })

  it('returns the current user for a valid session cookie', async () => {
    findUserById.mockResolvedValue(fakeUser())
    const token = await signSession('user-1')
    const res = await request(createApp())
      .get('/api/me')
      .set('Cookie', `sid=${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'user-1',
      email: 'dev@example.com',
      name: 'Dev User',
      avatarUrl: 'https://example.com/avatar.png',
    })
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session cookie and returns 204', async () => {
    const res = await request(createApp()).post('/api/auth/logout').set('Content-Type', 'application/json')
    expect(res.status).toBe(204)
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((cookie) => cookie.startsWith('sid=;'))).toBe(true)
  })

  it('returns 415 without a json content type', async () => {
    const res = await request(createApp()).post('/api/auth/logout')
    expect(res.status).toBe(415)
  })
})
