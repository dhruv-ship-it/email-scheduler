import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../lib/errors'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Bull Board's own UI issues bodiless requests with no Content-Type header.
// It still sits behind requireAuth, and is read-only in production.
const EXEMPT_PREFIX = '/api/admin/queues'

export function jsonContentTypeGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || req.path.startsWith(EXEMPT_PREFIX)) {
    next()
    return
  }
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    next(new ApiError('unsupported_media_type', 'Send JSON with a Content-Type: application/json header.'))
    return
  }
  next()
}
