import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/errors'
import { jsonContentTypeGuard } from './json-guard'

function buildApp(): Express {
  const app = express()
  app.use(jsonContentTypeGuard)
  app.get('/probe', (_req, res) => res.json({ ok: true }))
  app.post('/probe', (_req, res) => res.json({ ok: true }))
  app.post('/api/admin/queues', (_req, res) => res.json({ ok: true }))
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } })
      return
    }
    res.status(500).json({ error: { code: 'internal', message: 'unexpected' } })
  })
  return app
}

describe('jsonContentTypeGuard', () => {
  it('lets GET requests through regardless of content type', async () => {
    const res = await request(buildApp()).get('/probe')
    expect(res.status).toBe(200)
  })

  it('rejects a mutating request with no content-type header', async () => {
    const res = await request(buildApp()).post('/probe')
    expect(res.status).toBe(415)
    expect(res.body.error.code).toBe('unsupported_media_type')
  })

  it('accepts a mutating request with an application/json content type', async () => {
    const res = await request(buildApp()).post('/probe').send({})
    expect(res.status).toBe(200)
  })

  it('exempts the bull board admin path so its bodiless requests pass', async () => {
    const res = await request(buildApp()).post('/api/admin/queues')
    expect(res.status).toBe(200)
  })
})
