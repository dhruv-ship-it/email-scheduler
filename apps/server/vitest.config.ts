import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors the dev scripts' --env-file-if-exists=../../.env: vitest has no CLI
// flag for it, and this stays off the dotenv package the spec rules out.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch {
  // Missing in CI, where the real variables are already set in the environment.
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
    setupFiles: ['./src/test/setup-unit-env.ts'],
  },
})
