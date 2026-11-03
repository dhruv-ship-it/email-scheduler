import { logger } from '../../lib/logger'
import { esClient, searchIndex } from './client'
import { indexMappings, indexSettings } from './index-definition'

const RETRY_EVERY_MS = 5000
const RETRY_FOR_MS = 60_000

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Creates the physical index and points the alias at it, unless the alias already
// exists. Two processes booting together can both get here; the loser's create fails
// with "already exists" when they land in the same second, which is treated as success.
export async function ensureIndex(): Promise<void> {
  const alias = searchIndex.alias
  if (await esClient.indices.existsAlias({ name: alias })) return
  try {
    await esClient.indices.create({
      index: `${alias}-${timestamp(new Date())}`,
      settings: indexSettings,
      mappings: indexMappings,
      aliases: { [alias]: {} },
    })
  } catch (err) {
    const type = (err as { meta?: { body?: { error?: { type?: string } } } }).meta?.body?.error
      ?.type
    if (type !== 'resource_already_exists_exception') throw err
  }
}

// Search is an extra, not something sending depends on, so a cluster that stays down
// is logged and boot carries on; the api falls back to Postgres meanwhile.
export async function ensureIndexWithRetry(): Promise<void> {
  const deadline = Date.now() + RETRY_FOR_MS
  for (;;) {
    try {
      await ensureIndex()
      logger.info({ alias: searchIndex.alias }, 'search index ready')
      return
    } catch (err) {
      if (Date.now() + RETRY_EVERY_MS > deadline) {
        logger.warn({ err }, 'elasticsearch is unavailable, search will use postgres')
        return
      }
      await sleep(RETRY_EVERY_MS)
    }
  }
}
