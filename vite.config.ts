/**
 * Vite config for the SPA migration (replaces `next dev`/`next build`).
 * - React plugin for JSX/Fast Refresh.
 * - `@` alias → ./src so the existing components keep importing via `@/...`.
 * - Dev proxy: same-origin `/api/*` → the Rust backend on :8080.
 * - Build output → dist/ (index.html + hashed assets).
 *
 * Vite only bundles the entry import graph (src/main.tsx), so leftover Next
 * files under src/app/** are ignored by the bundler during this transition.
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
})
