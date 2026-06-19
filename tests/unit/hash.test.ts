import { describe, it, expect } from 'vitest'
import { truncateIp, dayStamp, visitorKey, ipHash, guestKeyHash } from '@/lib/hash'

describe('visitor privacy hashing (A-PII, NFR-9)', () => {
  it('truncates IPv4 to /24 (drops last octet)', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0/24')
    expect(truncateIp('8.8.8.8')).toBe('8.8.8.0/24')
  })

  it('truncates IPv6 to /48 (first three hextets)', () => {
    expect(truncateIp('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd::/48')
  })

  it('dayStamp is the UTC date', () => {
    expect(dayStamp(Date.parse('2026-06-19T23:59:59Z'))).toBe('2026-06-19')
  })

  it('visitorKey is deterministic for the same inputs+day and never echoes the IP', () => {
    const now = Date.parse('2026-06-19T10:00:00Z')
    const a = visitorKey({ ip: '203.0.113.42', userAgent: 'UA', now })
    const b = visitorKey({ ip: '203.0.113.42', userAgent: 'UA', now })
    expect(a).toBe(b)
    expect(a).not.toContain('203.0.113')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('visitorKey is cookie-first: same cookie => same key regardless of IP', () => {
    const now = Date.parse('2026-06-19T10:00:00Z')
    const a = visitorKey({ cookieId: 'vid-1', ip: '1.1.1.1', userAgent: 'A', now })
    const b = visitorKey({ cookieId: 'vid-1', ip: '2.2.2.2', userAgent: 'B', now })
    expect(a).toBe(b)
  })

  it('visitorKey rotates by day (different day => different key)', () => {
    const ua = 'UA'
    const d1 = visitorKey({ ip: '203.0.113.42', userAgent: ua, now: Date.parse('2026-06-19T10:00:00Z') })
    const d2 = visitorKey({ ip: '203.0.113.42', userAgent: ua, now: Date.parse('2026-06-20T10:00:00Z') })
    expect(d1).not.toBe(d2)
  })

  it('ipHash is stable per truncated IP and 32 hex chars', () => {
    expect(ipHash('203.0.113.42')).toBe(ipHash('203.0.113.99')) // same /24
    expect(ipHash('203.0.113.42')).toMatch(/^[0-9a-f]{32}$/)
    expect(ipHash('203.0.113.42')).not.toBe(ipHash('198.51.100.1'))
  })

  it('guestKeyHash is deterministic and non-reversible-looking', () => {
    expect(guestKeyHash('uuid-1')).toBe(guestKeyHash('uuid-1'))
    expect(guestKeyHash('uuid-1')).not.toBe(guestKeyHash('uuid-2'))
    expect(guestKeyHash('uuid-1')).toMatch(/^[0-9a-f]{64}$/)
  })
})
