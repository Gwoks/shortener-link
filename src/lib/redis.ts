/**
 * ioredis singleton (ARCHITECTURE.md §1.2, §7). One Redis covers cache, the
 * click stream, rate limiting, and unlock sessions. Lazy-connect so importing
 * this module in environments without Redis (e.g. some unit tests) doesn't
 * throw at import time.
 */
import Redis from 'ioredis'
import { env } from './env'

const globalForRedis = globalThis as unknown as { redis?: Redis }

export function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis
  const client = new Redis(env.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  })
  client.on('error', (err) => {
    // Avoid crashing the process on transient Redis errors; the hot path falls
    // back to Postgres on a cache miss/failure (§1.2 trade-off).
    console.error('[redis] error:', err.message)
  })
  globalForRedis.redis = client
  return client
}

/** Ping Redis for healthcheck (AC-52). Returns false on any failure. */
export async function redisHealthy(): Promise<boolean> {
  try {
    const pong = await getRedis().ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}
