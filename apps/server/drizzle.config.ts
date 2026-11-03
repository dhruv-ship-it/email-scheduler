import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // generate/check only diff the schema against the committed SQL, so this is never
    // connected to for those commands; it only matters for push, which this project doesn't use.
    url: process.env.DATABASE_URL ?? 'postgres://scheduler:scheduler@localhost:5432/scheduler',
  },
})
