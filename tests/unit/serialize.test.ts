import { describe, it, expect } from 'vitest'
import { serializeLink, toResolvedLink, shortUrlForCode } from '@/lib/serialize'
import type { Link } from '@prisma/client'

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'clz123',
    code: 'ab3xk9',
    aliasDisplay: null,
    destinationUrl: 'https://example.com/dest',
    ownerId: 'u1',
    isGuest: false,
    guestKey: null,
    status: 'ACTIVE',
    metaStatus: 'READY',
    metaTitle: 'Title',
    metaDescription: 'Desc',
    passwordHash: '$argon2id$secret',
    expiresAt: new Date('2026-07-01T00:00:00Z'),
    maxClicks: 1000,
    clickCount: 42,
    createdAt: new Date('2026-06-19T00:00:00Z'),
    updatedAt: new Date('2026-06-19T01:00:00Z'),
    ...overrides,
  } as Link
}

describe('serializeLink (§6.1)', () => {
  it('NEVER exposes passwordHash; only hasPassword (AC-45)', () => {
    const res = serializeLink(makeLink())
    expect((res as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
    expect(res.hasPassword).toBe(true)
  })

  it('hasPassword is false when no password is set', () => {
    expect(serializeLink(makeLink({ passwordHash: null })).hasPassword).toBe(false)
  })

  it('builds shortUrl from BASE_URL and uses the display alias when present', () => {
    const res = serializeLink(makeLink({ code: 'myalias', aliasDisplay: 'MyAlias' }))
    expect(res.code).toBe('MyAlias')
    expect(res.shortUrl).toBe(shortUrlForCode('MyAlias'))
  })

  it('serializes timestamps as ISO strings', () => {
    const res = serializeLink(makeLink())
    expect(res.expiresAt).toBe('2026-07-01T00:00:00.000Z')
    expect(res.createdAt).toBe('2026-06-19T00:00:00.000Z')
  })

  it('toResolvedLink carries only hot-path fields incl. hasPassword', () => {
    const r = toResolvedLink(makeLink())
    expect(r).toMatchObject({
      id: 'clz123',
      code: 'ab3xk9',
      destinationUrl: 'https://example.com/dest',
      status: 'ACTIVE',
      maxClicks: 1000,
      hasPassword: true,
    })
    expect((r as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
  })
})
