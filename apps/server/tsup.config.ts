import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts', 'src/migrate.ts', 'src/scripts/*.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // The shared package ships TypeScript source, so it has to be bundled in.
  noExternal: ['@scheduler/shared'],
})
