import { describe, it, expect } from 'vitest'
import { resolve, isCountedHit, type ResolvedLink } from '@/lib/redirect'

const NOW = Date.parse('2026-06-19T12:00:00Z')

function link(overrides: Partial<ResolvedLink> = {}): ResolvedLink {
  return {
    id: 'l1',
    code: 'ab3xk9',
    destinationUrl: 'https://example.com/dest',
    status: 'ACTIVE',
    expiresAt: null,
    maxClicks: null,
    clickCount: 0,
    hasPassword: false,
    ...overrides,
  }
}

describe('redirect.resolve (FR-4, AC-6/20/21/22)', () => {
  it('redirects an active link and counts the hit (AC-6)', () => {
    const d = resolve(link(), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'redirect', destination: 'https://example.com/dest', counted: true })
    expect(isCountedHit(d)).toBe(true)
  })

  it('returns not-found (404) for a missing link', () => {
    const d = resolve(null, { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'not-found', status: 404 })
    expect(isCountedHit(d)).toBe(false)
  })

  it('returns dead (410, deactivated) for a DEACTIVATED link', () => {
    const d = resolve(link({ status: 'DEACTIVATED' }), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'dead', status: 410, reason: 'deactivated' })
  })

  it('returns dead (410, expired) for an EXPIRED status', () => {
    const d = resolve(link({ status: 'EXPIRED' }), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'dead', status: 410, reason: 'expired' })
  })

  it('returns dead (410, expired) when expiresAt has passed (AC-20)', () => {
    const past = new Date(NOW - 1000).toISOString()
    const d = resolve(link({ expiresAt: past }), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'dead', status: 410, reason: 'expired' })
  })

  it('still redirects when expiresAt is in the future', () => {
    const future = new Date(NOW + 3600_000).toISOString()
    const d = resolve(link({ expiresAt: future }), { now: NOW, unlocked: false })
    expect(d.kind).toBe('redirect')
  })

  it('returns dead (410, max-clicks) once the cap is reached (AC-21)', () => {
    // maxClicks=1: the (K+1)th = 2nd hit must be dead. liveClickCount reflects
    // the count AFTER the atomic incr on the hot path.
    const atLimit = resolve(link({ maxClicks: 1 }), { now: NOW, unlocked: false, liveClickCount: 1 })
    expect(atLimit).toEqual({ kind: 'dead', status: 410, reason: 'max-clicks' })
  })

  it('allows the hit while under the max-clicks cap', () => {
    const under = resolve(link({ maxClicks: 5 }), { now: NOW, unlocked: false, liveClickCount: 4 })
    expect(under.kind).toBe('redirect')
  })

  it('falls back to clickCount when no live counter is supplied', () => {
    const d = resolve(link({ maxClicks: 3, clickCount: 3 }), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'dead', status: 410, reason: 'max-clicks' })
  })

  it('shows the gate (200) for a protected link without a valid unlock (AC-22)', () => {
    const d = resolve(link({ hasPassword: true }), { now: NOW, unlocked: false })
    expect(d).toEqual({ kind: 'gate', status: 200 })
    expect(isCountedHit(d)).toBe(false)
  })

  it('redirects a protected link once unlocked, counting the click (AC-25)', () => {
    const d = resolve(link({ hasPassword: true }), { now: NOW, unlocked: true })
    expect(d.kind).toBe('redirect')
    expect(isCountedHit(d)).toBe(true)
  })

  it('precedence: deactivated beats password gate', () => {
    const d = resolve(link({ status: 'DEACTIVATED', hasPassword: true }), { now: NOW, unlocked: false })
    expect(d.kind).toBe('dead')
  })

  it('precedence: expiry beats password gate', () => {
    const past = new Date(NOW - 1).toISOString()
    const d = resolve(link({ expiresAt: past, hasPassword: true }), { now: NOW, unlocked: true })
    expect(d).toMatchObject({ kind: 'dead', reason: 'expired' })
  })
})
