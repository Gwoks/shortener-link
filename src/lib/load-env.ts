/**
 * Minimal .env loader (zero-dependency). Next.js loads .env automatically, but
 * standalone entrypoints (the worker, the Prisma seed) do not — so they import
 * this first. Only sets keys that aren't already present in the environment, so
 * real env (docker-compose) always wins over the file.
 *
 * Honors NODE_ENV: loads `.env` always, then `.env.<NODE_ENV>` if present, and
 * `.env.local` last (without overriding already-set keys).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function parseAndApply(path: string): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

const cwd = process.cwd()
parseAndApply(join(cwd, '.env'))
const nodeEnv = process.env.NODE_ENV
if (nodeEnv) parseAndApply(join(cwd, `.env.${nodeEnv}`))
parseAndApply(join(cwd, '.env.local'))
