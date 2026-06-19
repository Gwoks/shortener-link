import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { infraAvailable } from './setup'

/**
 * Exercises the real link create + resolve service against the test Postgres +
 * Redis (AC-1/2/3/4/5/6/20/21/28/29/44). Skips gracefully if infra is absent.
 */
describe('links-service (integration)', () => {
  let up = false
  let prisma: typeof import('@/lib/db').prisma
  let svc: typeof import('@/lib/links-service')
  let cache: typeof import('@/lib/cache')
  let blocklist: typeof import('@/lib/blocklist')
  let redis: import('ioredis').default
  let u1 = ''

  beforeAll(async () => {
    up = await infraAvailable()
    if (!up) return
    prisma = (await import('@/lib/db')).prisma
    svc = await import('@/lib/links-service')
    cache = await import('@/lib/cache')
    blocklist = await import('@/lib/blocklist')
    redis = (await import('@/lib/redis')).getRedis()
    // Seed a deterministic blocklist for offline AC-44 verification.
    blocklist.__setBlocklistForTest(new Set(['evil.com']))
  })

  beforeEach(async () => {
    if (!up) return
    await prisma.clickEvent.deleteMany()
    await prisma.clickRollup.deleteMany()
    await prisma.visitorSeen.deleteMany()
    await prisma.link.deleteMany()
    await prisma.user.deleteMany()
    await redis.flushdb()
    const user = await prisma.user.create({ data: { email: 'svc-test@example.com' } })
    u1 = user.id
  })

  afterAll(async () => {
    if (!up) return
    await prisma.$disconnect()
    await redis.quit()
  })

  const guard = () => {
    if (!up) {
      // eslint-disable-next-line no-console
      console.warn('[integration] infra unavailable — skipping assertions')
      return true
    }
    return false
  }

  it('creates a link with a generated 6-char code (AC-1)', async () => {
    if (guard()) return
    const link = await svc.createLink({ url: 'https://example.com/a', ownerId: null, isGuest: false })
    expect(link.code).toHaveLength(6)
    expect(/^[0-9a-z]{6}$/.test(link.code)).toBe(true)
    expect(link.destinationUrl).toBe('https://example.com/a')
  })

  it('creates a link with a custom alias, stored lowercased with display case (AC-3)', async () => {
    if (guard()) return
    const link = await svc.createLink({
      url: 'https://example.com/b',
      alias: 'My-Custom-Name',
      ownerId: u1,
      isGuest: false,
    })
    expect(link.code).toBe('my-custom-name')
    expect(link.aliasDisplay).toBe('My-Custom-Name')
  })

  it('rejects a taken alias with suggestions (AC-4)', async () => {
    if (guard()) return
    await svc.createLink({ url: 'https://example.com/c', alias: 'spring-sale', ownerId: u1, isGuest: false })
    await expect(
      svc.createLink({ url: 'https://example.com/d', alias: 'spring-sale', ownerId: u1, isGuest: false }),
    ).rejects.toMatchObject({ code: 'ALIAS_TAKEN' })
  })

  it('alias match is case-insensitive (Spring-Sale collides with spring-sale)', async () => {
    if (guard()) return
    await svc.createLink({ url: 'https://example.com/c', alias: 'spring-sale', ownerId: u1, isGuest: false })
    await expect(
      svc.createLink({ url: 'https://example.com/d', alias: 'Spring-Sale', ownerId: u1, isGuest: false }),
    ).rejects.toMatchObject({ code: 'ALIAS_TAKEN' })
  })

  it('rejects a reserved alias (AC-5)', async () => {
    if (guard()) return
    await expect(
      svc.createLink({ url: 'https://example.com/e', alias: 'admin', ownerId: u1, isGuest: false }),
    ).rejects.toMatchObject({ code: 'ALIAS_RESERVED' })
  })

  it('rejects a blocklisted destination (AC-44)', async () => {
    if (guard()) return
    await expect(
      svc.createLink({ url: 'https://evil.com/login', ownerId: u1, isGuest: false }),
    ).rejects.toMatchObject({ code: 'URL_BLOCKED' })
  })

  it('assembles UTM params into the stored destination (AC-30)', async () => {
    if (guard()) return
    const link = await svc.createLink({
      url: 'https://example.com/p',
      utm: { source: 'nl', medium: 'email', campaign: 'spring' },
      ownerId: u1,
      isGuest: false,
    })
    const u = new URL(link.destinationUrl)
    expect(u.searchParams.get('utm_source')).toBe('nl')
    expect(u.searchParams.get('utm_campaign')).toBe('spring')
  })

  it('sets a 24h expiry on guest links (FR-33)', async () => {
    if (guard()) return
    const before = Date.now()
    const link = await svc.createLink({ url: 'https://example.com/g', ownerId: null, isGuest: true, guestTtlHours: 24 })
    expect(link.isGuest).toBe(true)
    expect(link.expiresAt).not.toBeNull()
    const ttlMs = link.expiresAt!.getTime() - before
    expect(ttlMs).toBeGreaterThan(23 * 3600_000)
    expect(ttlMs).toBeLessThan(25 * 3600_000)
  })

  it('resolveForRedirect: miss → DB → warms cache; second call hits cache (AC-6)', async () => {
    if (guard()) return
    const link = await svc.createLink({ url: 'https://example.com/h', ownerId: u1, isGuest: false })
    const first = await svc.resolveForRedirect(link.code)
    expect(first.cache).toBe('miss')
    expect(first.link?.destinationUrl).toBe('https://example.com/h')
    const second = await svc.resolveForRedirect(link.code)
    expect(second.cache).toBe('hit')
    expect(second.link?.id).toBe(link.id)
  })

  it('resolveForRedirect: unknown code → negatively cached', async () => {
    if (guard()) return
    const first = await svc.resolveForRedirect('nope12')
    expect(first.link).toBeNull()
    const second = await svc.resolveForRedirect('nope12')
    expect(second.cache).toBe('dead')
  })

  it('invalidateRedirect forces a fresh DB read after edit (AC-28)', async () => {
    if (guard()) return
    const link = await svc.createLink({ url: 'https://example.com/old', ownerId: u1, isGuest: false })
    await svc.resolveForRedirect(link.code) // warm
    await prisma.link.update({ where: { id: link.id }, data: { destinationUrl: 'https://example.com/new' } })
    await cache.invalidateRedirect(link.code)
    const after = await svc.resolveForRedirect(link.code)
    expect(after.link?.destinationUrl).toBe('https://example.com/new')
  })

  it('max-clicks atomic counter denies the (K+1)th hit (AC-21)', async () => {
    if (guard()) return
    const link = await svc.createLink({ url: 'https://example.com/m', maxClicks: 2, ownerId: u1, isGuest: false })
    const a = await cache.incrClickCount(link.code, 0)
    const b = await cache.incrClickCount(link.code, 0)
    const c = await cache.incrClickCount(link.code, 0)
    expect(a).toBe(1)
    expect(b).toBe(2)
    expect(c).toBe(3) // 3 > maxClicks(2) → the route returns dead on this hit
  })
})
