import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function keyFromEnv(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'base64')
}

export function encrypt(plaintext: string, key: Buffer = keyFromEnv()): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.')
}

export function decrypt(payload: string, key: Buffer = keyFromEnv()): string {
  const parts = payload.split('.')
  const [ivPart, tagPart, dataPart] = parts
  if (parts.length !== 3 || ivPart === undefined || tagPart === undefined || dataPart === undefined) {
    throw new Error('malformed ciphertext')
  }
  const iv = Buffer.from(ivPart, 'base64')
  const tag = Buffer.from(tagPart, 'base64')
  const data = Buffer.from(dataPart, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
