import { eq } from 'drizzle-orm'
import { db } from '../../lib/db'
import { users, type UserRow } from '../../db/schema'
import type { GoogleIdentity } from './google'

export async function upsertGoogleUser(identity: GoogleIdentity): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({
      googleSub: identity.googleSub,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: identity.email,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        lastLoginAt: new Date(),
      },
    })
    .returning()
  if (!row) throw new Error('user upsert returned no row')
  return row
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) })
}

export function toMe(user: UserRow): { id: string; email: string; name: string; avatarUrl: string | null } {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
}
