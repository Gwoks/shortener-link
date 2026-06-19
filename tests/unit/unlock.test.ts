import { describe, it, expect } from 'vitest'
import { createUnlockToken, verifyUnlockToken } from '@/lib/unlock'

const NOW = 1_750_000_000_000

describe('unlock tokens (FR-17, AC-23)', () => {
  it('verifies a freshly created token for the same code', () => {
    const t = createUnlockToken('ab3xk9', NOW, 1800)
    expect(verifyUnlockToken(t, 'ab3xk9', NOW + 1000)).toBe(true)
  })

  it('is case-insensitive on the code', () => {
    const t = createUnlockToken('AbC123', NOW, 1800)
    expect(verifyUnlockToken(t, 'abc123', NOW + 10)).toBe(true)
  })

  it('rejects a token for a different code (no cross-link unlock)', () => {
    const t = createUnlockToken('ab3xk9', NOW, 1800)
    expect(verifyUnlockToken(t, 'other1', NOW + 10)).toBe(false)
  })

  it('rejects an expired token', () => {
    const t = createUnlockToken('ab3xk9', NOW, 60)
    expect(verifyUnlockToken(t, 'ab3xk9', NOW + 61_000)).toBe(false)
  })

  it('rejects null/garbage/tampered tokens', () => {
    expect(verifyUnlockToken(null, 'ab3xk9', NOW)).toBe(false)
    expect(verifyUnlockToken('garbage', 'ab3xk9', NOW)).toBe(false)
    const t = createUnlockToken('ab3xk9', NOW, 1800)
    const tampered = t.slice(0, -2) + 'xy'
    expect(verifyUnlockToken(tampered, 'ab3xk9', NOW + 10)).toBe(false)
  })
})
