import { env } from '../../config/env'
import { senders } from '../../db/schema'
import { db } from '../../lib/db'
import { encrypt } from '../../lib/crypto'
import { logger } from '../../lib/logger'
import { createEtherealAccount } from './ethereal'

// Runs once on api boot. If senders already exist, or ETHEREAL_SENDER_COUNT is 0,
// there's nothing to do; an empty table with senders turned off is a valid setup.
export async function provisionEtherealSenders(): Promise<void> {
  if (env.ETHEREAL_SENDER_COUNT <= 0) return

  const existing = await db.select({ id: senders.id }).from(senders).limit(1)
  if (existing.length > 0) return

  const createdEmails: string[] = []
  for (let i = 1; i <= env.ETHEREAL_SENDER_COUNT; i++) {
    try {
      const account = await createEtherealAccount()
      const [row] = await db
        .insert(senders)
        .values({
          name: `Sender ${i}`,
          email: account.user,
          smtpHost: account.smtp.host,
          smtpPort: account.smtp.port,
          smtpSecure: account.smtp.secure,
          smtpUser: account.user,
          smtpPassEnc: encrypt(account.pass),
        })
        .returning({ email: senders.email })
      if (row) createdEmails.push(row.email)
    } catch (err) {
      logger.warn({ err }, 'could not create an ethereal test account')
    }
  }

  if (createdEmails.length > 0) {
    logger.info({ senders: createdEmails }, 'provisioned ethereal senders')
  }
}
