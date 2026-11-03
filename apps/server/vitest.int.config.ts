import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch {
  // Missing in CI, where the real variables are already set in the environment.
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    exclude: ['**/node_modules/**'],
    setupFiles: ['./src/test/setup-int-env.ts', './src/test/setup-int-db.ts'],
    // These share one Postgres database and one Redis db (15); running files
    // in parallel would let their truncate/flush calls stomp on each other.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
