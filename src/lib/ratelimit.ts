/**
 * Token-bucket rate limiting + independent unlock lockout (ARCHITECTURE.md §4.4,
 * FR-35/18, AC-24/43). Atomic via a small Lua script so concurrent requests
 * can't over-spend. Two independent limiters:
 *   - rl:shorten:{ipHash}             — link creation (FR-35)
 *   - rl:unlock:{linkId}:{ipHash}     — password attempts, with lockout (FR-18)
 *
 * Fail-open on Redis errors (availability > strictness for a self-hosted app);
 * the offline blocklist + SSRF guard remain the hard security controls.
 */
import { getRedis } from './redis'
import { env } from './env'
import { ipHash } from './hash'

// Returns: {allowed(0/1), remaining, retryAfterSec}
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local nowMs = tonumber(ARGV[4])
local cost = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = nowMs
end

-- Refill proportional to elapsed time.
local elapsed = nowMs - ts
if elapsed > 0 then
  local refilled = (elapsed / windowMs) * refill
  tokens = math.min(capacity, tokens + refilled)
  ts = nowMs
end

local allowed = 0
local retryAfter = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  local deficit = cost - tokens
  retryAfter = math.ceil((deficit / refill) * (windowMs / 1000))
end

redis.call('HSET', key, 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', key, windowMs * 2)
return { allowed, math.floor(tokens), retryAfter }
`

export interface RateResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

async function consumeToken(
  key: string,
  capacity: number,
  refill: number,
  windowSec: number,
  now: number,
  cost = 1,
): Promise<RateResult> {
  try {
    const redis = getRedis()
    const res = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      String(capacity),
      String(refill),
      String(windowSec * 1000),
      String(now),
      String(cost),
    )) as [number, number, number]
    return { allowed: res[0] === 1, remaining: res[1], retryAfterSec: res[2] }
  } catch {
    // Fail open.
    return { allowed: true, remaining: capacity, retryAfterSec: 0 }
  }
}

/** Per-IP shorten limiter (FR-35). `ip` is the raw client IP (hashed inside). */
export async function checkShortenLimit(ip: string | null, now: number = Date.now()): Promise<RateResult> {
  const cfg = env.rlShorten
  return consumeToken(`rl:shorten:${ipHash(ip)}`, cfg.capacity, cfg.refill, cfg.windowSec, now)
}

// ─── Unlock limiter with lockout (FR-18, AC-24) ──────────────────────────────

export interface UnlockGate {
  locked: boolean
  retryAfterSec: number
}

const lockoutKey = (linkId: string, ip: string | null) => `rl:unlock:lock:${linkId}:${ipHash(ip)}`

/** Check whether unlock attempts are currently locked out for this link+IP. */
export async function checkUnlockGate(
  linkId: string,
  ip: string | null,
  now: number = Date.now(),
): Promise<UnlockGate> {
  try {
    const redis = getRedis()
    const ttl = await redis.pttl(lockoutKey(linkId, ip))
    if (ttl > 0) return { locked: true, retryAfterSec: Math.ceil(ttl / 1000) }
  } catch {
    /* fail open */
  }
  // Also consume from a token bucket so sustained guessing is throttled even
  // before the hard lockout trips.
  const cfg = env.rlUnlock
  const bucket = await consumeToken(
    `rl:unlock:${linkId}:${ipHash(ip)}`,
    cfg.capacity,
    cfg.refill,
    cfg.windowSec,
    now,
  )
  if (!bucket.allowed) return { locked: true, retryAfterSec: bucket.retryAfterSec }
  return { locked: false, retryAfterSec: 0 }
}

/**
 * Record a failed unlock attempt; after `capacity` consecutive failures within
 * the window, set a hard lockout for `lockoutSec` (AC-24).
 */
export async function recordUnlockFailure(linkId: string, ip: string | null): Promise<void> {
  const cfg = env.rlUnlock
  try {
    const redis = getRedis()
    const failKey = `rl:unlock:fail:${linkId}:${ipHash(ip)}`
    const fails = await redis.incr(failKey)
    await redis.expire(failKey, cfg.windowSec)
    if (fails >= cfg.capacity) {
      await redis.set(lockoutKey(linkId, ip), '1', 'EX', cfg.lockoutSec)
      await redis.del(failKey)
    }
  } catch {
    /* best-effort */
  }
}

/** Clear unlock failure/lockout state on a successful unlock. */
export async function clearUnlockFailures(linkId: string, ip: string | null): Promise<void> {
  try {
    const redis = getRedis()
    await redis.del(`rl:unlock:fail:${linkId}:${ipHash(ip)}`, lockoutKey(linkId, ip))
  } catch {
    /* best-effort */
  }
}
