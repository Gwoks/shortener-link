import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Integration tests share a single test Postgres + Redis, so run test files
    // sequentially to avoid cross-file interference (one file's flushdb/cleanup
    // clobbering another's state). Unit tests are pure and unaffected.
    fileParallelism: false,
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db.ts', 'src/lib/redis.ts', 'src/lib/auth.ts', 'src/lib/geo.ts'],
    },
  },
})
