/**
 * Redirect cache (ARCHITECTURE.md §2.2.A, §8.1). Cache-aside store of the fully
 * resolved redirect decision per code, with positive + negative entries and
 * explicit invalidation on edit/delete (FR-21, AC-28). On a Redis miss/error
 * the caller reads Postgres and re-warms (correctness preserved, §1.2).
 */
import { getRedis } from './redis'
import { env } from './env'
import type { ResolvedLink } from './redirect'

const keyFor = (code: string) => `redirect:${code.toLowerCase()}`

/** Sentinel value for a code that does not exist / is dead (negative cache). */
const DEAD = '__DEAD__'

export type CacheLookup =
  | { state: 'hit'; link: ResolvedLink }
  | { state: 'dead' } // negatively cached not-found/dead
  | { state: 'miss' } // not in cache — caller must consult Postgres

/** Read a cached redirect decision. Never throws (returns miss on error). */
export async function getRedirect(code: string): Promise<CacheLookup> {
  try {
    const raw = await getRedis().get(keyFor(code))
    if (raw === null) return { state: 'miss' }
    if (raw === DEAD) return { state: 'dead' }
    return { state: 'hit', link: JSON.parse(raw) as ResolvedLink }
  } catch {
    return { state: 'miss' }
  }
}

/** Cache a resolved (active) link decision with the positive TTL. */
export async function setRedirect(link: ResolvedLink): Promise<void> {
  try {
    await getRedis().set(keyFor(link.code), JSON.stringify(link), 'EX', env.redirectCacheTtl)
  } catch {
    /* best-effort */
  }
}

/** Negatively cache a not-found/dead code with the short negative TTL. */
export async function setDead(code: string): Promise<void> {
  try {
    await getRedis().set(keyFor(code), DEAD, 'EX', env.redirectNegativeCacheTtl)
  } catch {
    /* best-effort */
  }
}

/** Invalidate a code's cache entry (called on PATCH/DELETE, AC-28/29). */
export async function invalidateRedirect(code: string): Promise<void> {
  try {
    await getRedis().del(keyFor(code))
  } catch {
    /* best-effort */
  }
}

// ─── Max-clicks atomic counter (§4.4, AC-21) ─────────────────────────────────
const clickCounterKey = (code: string) => `clicks:count:${code.toLowerCase()}`

/**
 * Atomically increment and return the live click counter for a code. Used to
 * enforce max-clicks on the hot path without a DB round-trip. Seeds the counter
 * from the known durable count on first use so restarts don't reset it below
 * the real value. Returns null on Redis failure (caller falls back to the
 * cached count).
 */
export async function incrClickCount(code: string, seedIfMissing: number): Promise<number | null> {
  try {
    const redis = getRedis()
    const key = clickCounterKey(code)
    // SET NX to seed, then INCR — two ops, but only the first SET is conditional.
    await redis.set(key, String(seedIfMissing), 'EX', env.redirectCacheTtl, 'NX')
    const val = await redis.incr(key)
    await redis.expire(key, env.redirectCacheTtl)
    return val
  } catch {
    return null
  }
}

/** Peek the live counter without incrementing (for gate/dead decisions). */
export async function peekClickCount(code: string): Promise<number | null> {
  try {
    const raw = await getRedis().get(clickCounterKey(code))
    return raw === null ? null : Number.parseInt(raw, 10)
  } catch {
    return null
  }
}

/** Drop the click counter (on edit/delete so a new cap takes effect). */
export async function resetClickCount(code: string): Promise<void> {
  try {
    await getRedis().del(clickCounterKey(code))
  } catch {
    /* best-effort */
  }
}
