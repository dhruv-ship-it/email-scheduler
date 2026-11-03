export const API_ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'not_found',
  'conflict',
  'unsupported_media_type',
  'unavailable',
  'internal',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  unsupported_media_type: 415,
  unavailable: 503,
  internal: 500,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}
