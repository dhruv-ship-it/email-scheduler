type SmtpLikeError = { code?: string; responseCode?: number }

// SMTP 5xx replies are permanent (bad address, policy rejection); EENVELOPE means
// nodemailer rejected the envelope itself, which a retry can never fix either.
export function isPermanentSmtpError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, responseCode } = err as SmtpLikeError
  if (code === 'EENVELOPE') return true
  return typeof responseCode === 'number' && responseCode >= 500 && responseCode < 600
}
