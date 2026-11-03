import { queryClient } from './query-client'
import { queryKeys } from './query-keys'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } }

const SESSION_PATH = '/api/me'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  // The server's JSON guard (CSRF defence) wants this on every write, body or not.
  if (method !== 'GET') headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'unavailable', "Couldn't reach the server. Check your connection.")
  }

  if (response.ok) {
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
  }

  const parsed = (await response.json().catch(() => null)) as ErrorBody | null
  const error = parsed?.error
  // The session query handles its own 401; invalidating it from here would loop.
  if (response.status === 401 && path !== SESSION_PATH) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.me })
  }
  throw new ApiError(
    response.status,
    error?.code ?? 'internal',
    error?.message ?? 'Something went wrong. Try again.',
    error?.details,
  )
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
