import nodemailer, { type SentMessageInfo, type Transporter } from 'nodemailer'
import { env } from '../config/env'
import type { SenderRow } from '../db/schema'
import { decrypt } from './crypto'

const transporters = new Map<string, Transporter>()

function buildTransporter(sender: SenderRow): Transporter {
  if (env.MAIL_TRANSPORT === 'json') {
    return nodemailer.createTransport({ jsonTransport: true })
  }
  return nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: { user: sender.smtpUser, pass: decrypt(sender.smtpPassEnc) },
    pool: true,
    maxConnections: 2,
  })
}

function transporterFor(sender: SenderRow): Transporter {
  const cached = transporters.get(sender.id)
  if (cached) return cached
  const transporter = buildTransporter(sender)
  transporters.set(sender.id, transporter)
  return transporter
}

export type OutgoingMail = {
  from: string
  to: string
  subject: string
  text: string
  html: string
  messageId: string
  headers: Record<string, string>
}

export function sendMail(sender: SenderRow, message: OutgoingMail): Promise<SentMessageInfo> {
  return transporterFor(sender).sendMail(message)
}

export function getPreviewUrl(info: SentMessageInfo): string | null {
  const url = nodemailer.getTestMessageUrl(info)
  return url || null
}

export function closeMailer(): void {
  for (const transporter of transporters.values()) transporter.close()
  transporters.clear()
}
