export type Cursor = { v: string; id: string }

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Cursor).v === 'string' &&
      typeof (parsed as Cursor).id === 'string'
    ) {
      return { v: (parsed as Cursor).v, id: (parsed as Cursor).id }
    }
    return null
  } catch {
    return null
  }
}
