import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080'

// E2E runs against the single Rust binary (API + /:code redirect + static SPA).
// By default Playwright boots it via scripts/e2e-server.sh (build + seed temp DB
// + serve). Set NO_WEB_SERVER=1 to point at an already-running stack via E2E_BASE_URL.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  ...(process.env.NO_WEB_SERVER
    ? {}
    : {
        webServer: {
          command: 'bash scripts/e2e-server.sh',
          url: `${BASE_URL}/api/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
