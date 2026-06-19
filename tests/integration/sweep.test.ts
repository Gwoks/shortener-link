import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { infraAvailable } from './setup'

/**
 * Exercises the expiry sweep against the test DB (NFR-12, AC-20/41). Skips if
 * infra is absent.
 */
describe('expiry sweep (integration)', () => {
  let up = false
  let prisma: typeof import('@/lib/db').prisma
  let sweep: typeof import('@/worker/sweep')
  let redis: import('ioredis').default

  beforeAll(async () => {
    up = await infraAvailable()
    if (!up) return
    prisma = (await import('@/lib/db')).prisma
    sweep = await import('@/worker/sweep')
    redis = (await import('@/lib/redis')).getRedis()
  })

  beforeEach(async () => {
    if (!up) return
    await prisma.clickEvent.deleteMany()
    await prisma.link.deleteMany()
    await redis.flushdb()
  })

  afterAll(async () => {
    if (!up) return
    await prisma.$disconnect()
    await redis.quit()
  })

  const guard = () => !up

  it('flips past-expiry ACTIVE links to EXPIRED (AC-20)', async () => {
    if (guard()) return
    const now = new Date('2026-06-19T12:00:00Z')
    const expired = await prisma.link.create({
      data: { code: 'sw-exp', destinationUrl: 'https://example.com/x', status: 'ACTIVE', expiresAt: new Date(now.getTime() - 1000) },
    })
    const live = await prisma.link.create({
      data: { code: 'sw-live', destinationUrl: 'https://example.com/y', status: 'ACTIVE', expiresAt: new Date(now.getTime() + 3600_000) },
    })
    const noExpiry = await prisma.link.create({
      data: { code: 'sw-none', destinationUrl: 'https://example.com/z', status: 'ACTIVE', expiresAt: null },
    })

    const count = await sweep.sweepOnce(now)
    expect(count).toBe(1)

    expect((await prisma.link.findUnique({ where: { id: expired.id } }))!.status).toBe('EXPIRED')
    expect((await prisma.link.findUnique({ where: { id: live.id } }))!.status).toBe('ACTIVE')
    expect((await prisma.link.findUnique({ where: { id: noExpiry.id } }))!.status).toBe('ACTIVE')
  })

  it('expires past-TTL guest links too (AC-41)', async () => {
    if (guard()) return
    const now = new Date('2026-06-19T12:00:00Z')
    const guest = await prisma.link.create({
      data: {
        code: 'sw-guest',
        destinationUrl: 'https://example.com/g',
        status: 'ACTIVE',
        isGuest: true,
        expiresAt: new Date(now.getTime() - 1000),
      },
    })
    await sweep.sweepOnce(now)
    expect((await prisma.link.findUnique({ where: { id: guest.id } }))!.status).toBe('EXPIRED')
  })

  it('is a no-op when nothing is due', async () => {
    if (guard()) return
    await prisma.link.create({
      data: { code: 'sw-ok', destinationUrl: 'https://example.com/ok', status: 'ACTIVE', expiresAt: null },
    })
    expect(await sweep.sweepOnce(new Date())).toBe(0)
  })
})
