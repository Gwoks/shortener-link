import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { infraAvailable } from './setup'

/**
 * Exercises the real click ingestion + rollup + analytics read path against the
 * test DB (AC-9/10/11/13/16). Calls processEvent directly (the consumer loop is
 * just an XREADGROUP wrapper around it) for determinism.
 */
describe('click ingestion + analytics (integration)', () => {
  let up = false
  let prisma: typeof import('@/lib/db').prisma
  let consumer: typeof import('@/worker/clickConsumer')
  let analytics: typeof import('@/lib/analytics-service')
  let redis: import('ioredis').default
  let u1 = ''

  beforeAll(async () => {
    up = await infraAvailable()
    if (!up) return
    prisma = (await import('@/lib/db')).prisma
    consumer = await import('@/worker/clickConsumer')
    analytics = await import('@/lib/analytics-service')
    redis = (await import('@/lib/redis')).getRedis()
  })

  beforeEach(async () => {
    if (!up) return
    await prisma.clickEvent.deleteMany()
    await prisma.clickRollup.deleteMany()
    await prisma.visitorSeen.deleteMany()
    await prisma.link.deleteMany()
    await prisma.user.deleteMany()
    await redis.flushdb()
    const user = await prisma.user.create({ data: { email: 'click-test@example.com' } })
    u1 = user.id
  })

  afterAll(async () => {
    if (!up) return
    await prisma.$disconnect()
    await redis.quit()
  })

  async function makeLink(code: string) {
    return prisma.link.create({
      data: { code, destinationUrl: `https://example.com/${code}`, ownerId: u1, status: 'ACTIVE' },
    })
  }

  const guard = () => !up

  it('processes a click into event + rollup + clickCount (AC-9)', async () => {
    if (guard()) return
    const link = await makeLink('click1')
    await consumer.processEvent({
      streamId: '1-0',
      linkId: link.id,
      code: 'click1',
      occurredAt: Date.parse('2026-06-19T10:00:00Z'),
      ip: '8.8.8.8',
      ua: 'Mozilla/5.0 (Macintosh) Chrome/120.0',
      ref: 'https://facebook.com/x',
      vid: 'visitor-A',
    })
    const fresh = await prisma.link.findUnique({ where: { id: link.id } })
    expect(fresh!.clickCount).toBe(1)
    const events = await prisma.clickEvent.count({ where: { linkId: link.id } })
    expect(events).toBe(1)
    const rollup = await prisma.clickRollup.findFirst({ where: { linkId: link.id } })
    expect(rollup!.clicks).toBe(1)
    expect(rollup!.uniques).toBe(1)
  })

  it('is idempotent on streamId (no double count, NFR-3)', async () => {
    if (guard()) return
    const link = await makeLink('click2')
    const ev = {
      streamId: '2-0',
      linkId: link.id,
      code: 'click2',
      occurredAt: Date.now(),
      ip: '8.8.8.8',
      ua: 'UA',
      ref: null,
      vid: 'v',
    }
    await consumer.processEvent(ev)
    await consumer.processEvent(ev) // replay
    const fresh = await prisma.link.findUnique({ where: { id: link.id } })
    expect(fresh!.clickCount).toBe(1)
  })

  it('counts unique visitors cookie-first (AC-10)', async () => {
    if (guard()) return
    const link = await makeLink('click3')
    const base = { linkId: link.id, code: 'click3', occurredAt: Date.now(), ip: '1.2.3.4', ua: 'UA', ref: null }
    await consumer.processEvent({ ...base, streamId: '3-0', vid: 'visitor-A' })
    await consumer.processEvent({ ...base, streamId: '3-1', vid: 'visitor-A' }) // same visitor
    await consumer.processEvent({ ...base, streamId: '3-2', vid: 'visitor-B' }) // new visitor
    const rollup = await prisma.clickRollup.findFirst({ where: { linkId: link.id } })
    expect(rollup!.clicks).toBe(3)
    expect(rollup!.uniques).toBe(2)
  })

  it('categorizes referrers and surfaces them in analytics (AC-11)', async () => {
    if (guard()) return
    const link = await makeLink('click4')
    const at = Date.parse('2026-06-19T10:00:00Z')
    await consumer.processEvent({ streamId: '4-0', linkId: link.id, code: 'click4', occurredAt: at, ip: '8.8.8.8', ua: 'UA', ref: 'https://facebook.com/p', vid: 'a' })
    await consumer.processEvent({ streamId: '4-1', linkId: link.id, code: 'click4', occurredAt: at, ip: '8.8.8.8', ua: 'UA', ref: null, vid: 'b' })
    const data = await analytics.getLinkAnalytics(link.id, 'all', Date.now())
    expect(data.totals.clicks).toBe(2)
    const cats = data.referrers.map((r) => r.category)
    expect(cats).toContain('SOCIAL')
    expect(cats).toContain('DIRECT')
  })

  it('per-link analytics on a fresh link reports insufficientData (AC-16)', async () => {
    if (guard()) return
    const link = await makeLink('click5')
    const data = await analytics.getLinkAnalytics(link.id, 'all', Date.now())
    expect(data.totals.clicks).toBe(0)
    expect(data.insufficientData).toBe(true)
  })

  it('aggregate analytics sum across a user’s links (AC-13)', async () => {
    if (guard()) return
    const l1 = await makeLink('agg1')
    const l2 = await makeLink('agg2')
    const at = Date.parse('2026-06-19T10:00:00Z')
    await consumer.processEvent({ streamId: 'a-0', linkId: l1.id, code: 'agg1', occurredAt: at, ip: '8.8.8.8', ua: 'UA', ref: null, vid: 'a' })
    await consumer.processEvent({ streamId: 'a-1', linkId: l2.id, code: 'agg2', occurredAt: at, ip: '8.8.8.8', ua: 'UA', ref: null, vid: 'b' })
    await consumer.processEvent({ streamId: 'a-2', linkId: l2.id, code: 'agg2', occurredAt: at, ip: '9.9.9.9', ua: 'UA', ref: null, vid: 'c' })
    const sum = await analytics.getSummaryAnalytics(u1, 'all', Date.now())
    expect(sum.totals.clicks).toBe(3)
    expect(sum.topLinks[0].code).toBe('agg2') // 2 clicks > 1
  })

  it('analytics survive link deactivation but vanish on delete (AC-14)', async () => {
    if (guard()) return
    const link = await makeLink('life1')
    await consumer.processEvent({ streamId: 'l-0', linkId: link.id, code: 'life1', occurredAt: Date.now(), ip: '8.8.8.8', ua: 'UA', ref: null, vid: 'a' })
    await prisma.link.update({ where: { id: link.id }, data: { status: 'DEACTIVATED' } })
    let data = await analytics.getLinkAnalytics(link.id, 'all', Date.now())
    expect(data.totals.clicks).toBe(1) // still viewable after deactivation
    await prisma.link.delete({ where: { id: link.id } })
    const events = await prisma.clickEvent.count({ where: { linkId: link.id } })
    expect(events).toBe(0) // cascade removed analytics
  })
})
