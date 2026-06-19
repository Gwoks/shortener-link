import { describe, it, expect } from 'vitest'
import { rangeStart } from '@/lib/analytics-service'

const NOW = Date.parse('2026-06-19T12:00:00Z')

describe('analytics rangeStart (FR-7/8)', () => {
  it('returns null for "all" (no lower bound)', () => {
    expect(rangeStart('all', NOW)).toBeNull()
  })

  it('computes a UTC-midnight start N days back', () => {
    const d7 = rangeStart('7d', NOW)!
    expect(d7.toISOString()).toBe('2026-06-12T00:00:00.000Z')
    const d30 = rangeStart('30d', NOW)!
    expect(d30.toISOString()).toBe('2026-05-20T00:00:00.000Z')
    const d90 = rangeStart('90d', NOW)!
    expect(d90.getUTCHours()).toBe(0)
  })
})
