import { senders } from '../db/schema'
import { db, pool } from '../lib/db'
import { encrypt } from '../lib/crypto'
import { logger } from '../lib/logger'
import { createEtherealAccount } from '../modules/senders/ethereal'

type Args = { count: number; name: string; hourlyLimit: number | null }

function parseArgs(argv: string[]): Args {
  let count = 1
  let name = 'Sender'
  let hourlyLimit: number | null = null
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) continue
    if (flag === '--count') {
      count = Number(value)
      i++
    } else if (flag === '--name') {
      name = value
      i++
    } else if (flag === '--hourly-limit') {
      hourlyLimit = Number(value)
      i++
    }
  }
  return { count, name, hourlyLimit }
}

async function main(): Promise<void> {
  const { count, name, hourlyLimit } = parseArgs(process.argv.slice(2))
  for (let i = 1; i <= count; i++) {
    const senderName = count > 1 ? `${name} ${i}` : name
    const account = await createEtherealAccount()
    const [row] = await db
      .insert(senders)
      .values({
        name: senderName,
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpSecure: account.smtp.secure,
        smtpUser: account.user,
        smtpPassEnc: encrypt(account.pass),
        hourlyLimit,
      })
      .returning({ id: senders.id, email: senders.email })
    if (row) process.stdout.write(`${row.id}  ${row.email}\n`)
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'could not create senders')
    process.exitCode = 1
  })
  .finally(() => {
    void pool.end()
  })
