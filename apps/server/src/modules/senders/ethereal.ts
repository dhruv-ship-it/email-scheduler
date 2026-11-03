import nodemailer, { type TestAccount } from 'nodemailer'

// nodemailer caches the first createTestAccount() result for the life of the
// process (its own ETHEREAL_CACHE setting, default "yes"), so a second call
// would otherwise hand back the same account instead of a new one. Both the
// boot provisioning and the create-senders script need several distinct ones.
process.env.ETHEREAL_CACHE = 'no'

export function createEtherealAccount(): Promise<TestAccount> {
  return nodemailer.createTestAccount()
}
