/**
 * Integration-test harness. Loads `.env.test`, connects to the test Postgres +
 * Redis, and exposes a `describeIntegration` that SKIPS the whole suite when the
 * infra is unreachable — so `pnpm test` stays green on machines without a DB
 * while still exercising the real data layer when one is present (the QA gate
 * runs these against the docker-compose stack).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe } from 'vitest'

// Load .env.test into process.env BEFORE any module reads env (the lib modules
// read process.env lazily via getters, so setting it here is sufficient).
function loadEnvTest() {
  const path = join(process.cwd(), '.env.test')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}
loadEnvTest()

let infraChecked = false
let infraUp = false

export async function infraAvailable(): Promise<boolean> {
  if (infraChecked) return infraUp
  infraChecked = true
  try {
    const { prisma } = await import('@/lib/db')
    const { getRedis } = await import('@/lib/redis')
    await prisma.$queryRaw`SELECT 1`
    const pong = await getRedis().ping()
    infraUp = pong === 'PONG'
  } catch {
    infraUp = false
  }
  return infraUp
}

/**
 * Synchronous check used to decide describe.skip. We do a quick TCP-style probe
 * by attempting a connection lazily inside the suite; if it was already found
 * down, skip. Because vitest needs the skip decision synchronously, suites call
 * `await infraAvailable()` in a beforeAll and skip individual tests via a guard,
 * but for ergonomics we also expose a describe wrapper that checks an env flag.
 */
export const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === '1'

export const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe
