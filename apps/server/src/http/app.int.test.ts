import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { closeQueues } from '../queue/queues'
import { createApp } from './app'

describe('createApp', () => {
  const original = env.NODE_ENV

  afterEach(() => {
    env.NODE_ENV = original
  })

  afterAll(async () => {
    await closeQueues()
  })

  it('trusts the proxy in front of it in production', () => {
    env.NODE_ENV = 'production'

    expect(createApp().get('trust proxy')).toBe(true)
  })

  it('does not trust forwarded headers outside production', () => {
    env.NODE_ENV = 'development'

    expect(createApp().get('trust proxy')).toBeFalsy()
  })
})
