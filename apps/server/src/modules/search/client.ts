import { Client } from '@elastic/elasticsearch'
import { env } from '../../config/env'

// A short request timeout keeps a hung cluster from stalling a search: the caller
// falls back to Postgres instead of waiting.
const REQUEST_TIMEOUT_MS = 2000

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  ...(env.ELASTICSEARCH_API_KEY ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } } : {}),
  requestTimeout: REQUEST_TIMEOUT_MS,
  maxRetries: 1,
})

// The alias is read and written through; the physical index behind it can be swapped
// without touching callers. It is an object so tests can point at their own alias and
// leave the development data alone.
export const searchIndex = { alias: 'emails' }
