import { eq } from 'drizzle-orm'
import { slackConnections, type SlackConnectionRow } from '../../db/schema'
import { db } from '../../lib/db'
import { encrypt } from '../../lib/crypto'

export async function findConnection(userId: string): Promise<SlackConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(slackConnections)
    .where(eq(slackConnections.userId, userId))
    .limit(1)
  return row
}

export type NewConnection = {
  userId: string
  teamId: string
  teamName: string
  channelId: string
  channelName: string
  webhookUrl: string
  accessToken: string
}

// One connection per user: connecting again replaces the old one. The webhook URL and
// token are secrets, so only their encrypted form is stored.
export async function upsertConnection(connection: NewConnection): Promise<void> {
  const values = {
    userId: connection.userId,
    teamId: connection.teamId,
    teamName: connection.teamName,
    channelId: connection.channelId,
    channelName: connection.channelName,
    webhookUrlEnc: encrypt(connection.webhookUrl),
    accessTokenEnc: encrypt(connection.accessToken),
    connectedAt: new Date(),
  }
  await db
    .insert(slackConnections)
    .values(values)
    .onConflictDoUpdate({ target: slackConnections.userId, set: values })
}

export async function deleteConnection(userId: string): Promise<void> {
  await db.delete(slackConnections).where(eq(slackConnections.userId, userId))
}
