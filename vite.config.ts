/// <reference types="vitest/config" />
/**
 * Vite config for the SPA (also hosts the Vitest config).
 * - React plugin for JSX/Fast Refresh.
 * - `@` alias → ./src so the existing components keep importing via `@/...`.
 * - Dev proxy: same-origin `/api/*` → the Rust backend on :8080.
 * - Build output → dist/ (index.html + hashed assets).
 * - Vitest: jsdom unit tests under src/**; coverage targets the shared modules.
 */
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'src/design/**',
        'src/data/**',
        'src/components/lib/{api,cn}.ts',
        'src/components/ui/{alert,button,card,highlight-pill,state-card}.tsx',
        'src/components/app/nav-items.ts',
        'src/components/links/links-query.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
