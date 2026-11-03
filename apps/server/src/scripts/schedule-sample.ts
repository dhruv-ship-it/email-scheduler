import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { env } from '../config/env'
import { senders, users } from '../db/schema'
import { db, pool } from '../lib/db'
import { logger } from '../lib/logger'
import { createCampaign } from '../modules/campaigns/create-campaign'
import { closeQueues } from '../queue/queues'

type Args = {
  user: string
  createUser: boolean
  count: number
  inSeconds: number
  senderId: string | null
  delaySeconds: number
  hourlyLimit: number
  subject: string
  body: string
}

function defaultArgs(): Args {
  return {
    user: '',
    createUser: false,
    count: 1,
    inSeconds: 0,
    senderId: null,
    delaySeconds: Math.ceil(env.MIN_SEND_INTERVAL_MS / 1000),
    hourlyLimit: 1000,
    subject: 'Sample campaign',
    body: 'This is a sample scheduled email.',
  }
}

function parseArgs(argv: string[]): Args {
  const args = defaultArgs()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--create-user') {
      args.createUser = true
      continue
    }
    if (value === undefined) continue
    if (flag === '--user') args.user = value
    else if (flag === '--count') args.count = Number(value)
    else if (flag === '--in') args.inSeconds = Number(value)
    else if (flag === '--sender') args.senderId = value
    else if (flag === '--delay') args.delaySeconds = Number(value)
    else if (flag === '--limit') args.hourlyLimit = Number(value)
    else if (flag === '--subject') args.subject = value
    else if (flag === '--body') args.body = value
    else continue
    i++
  }
  return args
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function resolveUserId(email: string, createUser: boolean): Promise<string> {
  if (createUser && env.NODE_ENV === 'production') {
    throw new Error('--create-user is refused when NODE_ENV=production.')
  }
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) return existing.id
  if (!createUser) {
    throw new Error(`No user with email ${email}. Pass --create-user to create one (dev only).`)
  }
  const [created] = await db
    .insert(users)
    .values({ googleSub: `dev:${randomUUID()}`, email, name: email.split('@')[0] ?? email })
    .returning()
  if (!created) throw new Error('could not create the user')
  return created.id
}

async function resolveSenderId(senderId: string | null): Promise<string> {
  if (senderId) return senderId
  const [sender] = await db.select({ id: senders.id }).from(senders).limit(1)
  if (!sender) throw new Error('No senders are set up yet. Run senders:create first.')
  return sender.id
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.user) throw new Error('--user <email> is required.')

  const userId = await resolveUserId(args.user, args.createUser)
  const senderId = await resolveSenderId(args.senderId)
  const stamp = Date.now()
  const recipients = Array.from(
    { length: Math.max(1, args.count) },
    (_, i) => `sample-${i + 1}-${stamp}@example.com`,
  )

  const result = await createCampaign({
    userId,
    senderId,
    subject: args.subject,
    bodyHtml: `<p>${escapeHtml(args.body)}</p>`,
    startAt: new Date(Date.now() + args.inSeconds * 1000).toISOString(),
    delaySeconds: args.delaySeconds,
    hourlyLimit: args.hourlyLimit,
    recipients,
  })

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main()
  .catch((err) => {
    logger.error({ err }, 'could not schedule the sample campaign')
    process.exitCode = 1
  })
  .finally(async () => {
    await closeQueues()
    await pool.end()
  })
