import { createRequire } from 'node:module'
import { pino, type LoggerOptions } from 'pino'
import { env } from '../config/env'

const pretty: LoggerOptions['transport'] = {
  target: 'pino-pretty',
  options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
}

// pino-pretty is a dev dependency, so the production image doesn't ship it. Reviewer-mode
// Docker still runs with NODE_ENV=development (cookies must stay non-Secure over plain
// http://localhost), so NODE_ENV alone can't gate this; check the package actually resolves.
function prettyTransportAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { role: env.ROLE },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'smtpPass',
      'smtpPassEnc',
      'accessToken',
      'webhookUrl',
      'password',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' && prettyTransportAvailable() ? { transport: pretty } : {}),
})
