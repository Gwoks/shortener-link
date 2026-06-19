import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { infraAvailable } from './setup'

/**
 * Exercises the real Redis token-bucket limiter + unlock lockout (AC-24/43)
 * against the test Redis. Skips if infra is absent.
 */
describe('rate limiting + unlock lockout (integration)', () => {
  let up = false
  let rl: typeof import('@/lib/ratelimit')
  let redis: import('ioredis').default

  beforeAll(async () => {
    up = await infraAvailable()
    if (!up) return
    rl = await import('@/lib/ratelimit')
    redis = (await import('@/lib/redis')).getRedis()
  })

  beforeEach(async () => {
    if (!up) return
    await redis.flushdb()
  })

  afterAll(async () => {
    if (!up) return
    await redis.quit()
  })

  const guard = () => !up

  it('allows up to capacity then denies with a retryAfter (AC-43)', async () => {
    if (guard()) return
    const ip = '203.0.113.10'
    const cap = (await import('@/lib/env')).env.rlShorten.capacity
    let lastAllowed = true
    let denied = false
    for (let i = 0; i < cap + 2; i++) {
      const r = await rl.checkShortenLimit(ip, Date.now())
      if (!r.allowed) {
        denied = true
        expect(r.retryAfterSec).toBeGreaterThan(0)
        break
      }
      lastAllowed = r.allowed
    }
    expect(lastAllowed).toBe(true)
    expect(denied).toBe(true)
  })

  it('different IPs have independent buckets', async () => {
    if (guard()) return
    const cap = (await import('@/lib/env')).env.rlShorten.capacity
    // Drain IP A.
    for (let i = 0; i < cap + 1; i++) await rl.checkShortenLimit('1.1.1.1', Date.now())
    // IP B is still fresh.
    const r = await rl.checkShortenLimit('2.2.2.2', Date.now())
    expect(r.allowed).toBe(true)
  })

  it('unlock failures escalate to an independent lockout (AC-24)', async () => {
    if (guard()) return
    const linkId = 'lk-1'
    const ip = '198.51.100.5'
    const cap = (await import('@/lib/env')).env.rlUnlock.capacity
    // Gate is open initially.
    expect((await rl.checkUnlockGate(linkId, ip)).locked).toBe(false)
    // Record enough failures to trip the hard lockout.
    for (let i = 0; i < cap; i++) await rl.recordUnlockFailure(linkId, ip)
    const gate = await rl.checkUnlockGate(linkId, ip)
    expect(gate.locked).toBe(true)
    expect(gate.retryAfterSec).toBeGreaterThan(0)
  })

  it('clearing failures lifts the lockout (successful unlock)', async () => {
    if (guard()) return
    const linkId = 'lk-2'
    const ip = '198.51.100.6'
    const cap = (await import('@/lib/env')).env.rlUnlock.capacity
    for (let i = 0; i < cap; i++) await rl.recordUnlockFailure(linkId, ip)
    expect((await rl.checkUnlockGate(linkId, ip)).locked).toBe(true)
    await rl.clearUnlockFailures(linkId, ip)
    expect((await rl.checkUnlockGate(linkId, ip)).locked).toBe(false)
  })

  it('unlock limiter is independent from the shorten limiter', async () => {
    if (guard()) return
    const ip = '203.0.113.77'
    const shortenCap = (await import('@/lib/env')).env.rlShorten.capacity
    // Drain the shorten bucket entirely.
    for (let i = 0; i < shortenCap + 2; i++) await rl.checkShortenLimit(ip, Date.now())
    // The unlock gate for a link is unaffected.
    expect((await rl.checkUnlockGate('lk-3', ip)).locked).toBe(false)
  })
})
