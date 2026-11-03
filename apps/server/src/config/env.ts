import { z } from 'zod'

export const ROLES = ['api', 'worker', 'all'] as const

export type Role = (typeof ROLES)[number]

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true')

const port = z.coerce.number().int().min(1).max(65535)

const base64Key = z.string().refine((v) => {
  try {
    return Buffer.from(v, 'base64').length === 32
  } catch {
    return false
  }
}, 'must be base64 of exactly 32 bytes')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ROLE: z.enum(ROLES).default('all'),
  PORT: port.default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://scheduler:scheduler@localhost:5432/scheduler'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: z.string().default(''),

  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ENCRYPTION_KEY: base64Key,

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_BASE_URL: z.string().default(''),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_SEND_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  MAX_EMAILS_PER_HOUR_GLOBAL: z.coerce.number().int().min(0).default(0),
  RATE_WINDOW_MS: z.coerce.number().int().min(1000).default(3_600_000),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),

  ETHEREAL_SENDER_COUNT: z.coerce.number().int().min(0).default(3),
  MAIL_TRANSPORT: z.enum(['smtp', 'json']).default('smtp'),
  BULL_BOARD_READ_ONLY: flag,

  POSTGRES_PASSWORD: z.string().default('scheduler'),
  API_DOMAIN: z.string().default(''),
})

export type Env = z.infer<typeof envSchema>

function describeFailure(error: z.ZodError, source: NodeJS.ProcessEnv): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)'
    const missing = source[name] === undefined || source[name] === ''
    return `  ${name}: ${missing ? 'is required but not set' : issue.message}`
  })
  return [
    `${lines.length} environment variable${lines.length === 1 ? '' : 's'} need attention:`,
    ...lines,
    '',
    'Copy .env.example to .env and fill in the blanks.',
  ].join('\n')
}

// npm scripts cannot set an env var the same way on Windows and Linux, so the dev
// scripts pass the role as main.ts's first argument instead; Docker still sets ROLE.
// Every other script under src/scripts/ has its own CLI flags in that same spot, so
// this only takes the override when argv[2] actually names a role, and otherwise
// leaves it to the environment rather than treating an unrelated flag as an error.
export function roleOverride(argv: readonly string[]): Role | undefined {
  const candidate = argv[2]
  if (candidate === undefined) return undefined
  const parsed = z.enum(ROLES).safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}

function load(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    process.stderr.write(`${describeFailure(parsed.error, process.env)}\n`)
    process.exit(1)
  }
  const role = roleOverride(process.argv)
  return role === undefined ? parsed.data : { ...parsed.data, ROLE: role }
}

export const env = load()
