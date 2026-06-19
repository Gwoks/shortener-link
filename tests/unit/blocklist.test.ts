import { describe, it, expect } from 'vitest'
import { parseBlocklist, isHostBlocked } from '@/lib/blocklist'

describe('inbound blocklist (FR-36, AC-44)', () => {
  const set = parseBlocklist(`
    # comment
    evil.com
    PHISHING.example.com

    bad-host.test
  `)

  it('parses, lowercases, strips comments/blanks/www', () => {
    expect(set.has('evil.com')).toBe(true)
    expect(set.has('phishing.example.com')).toBe(true)
    expect(set.has('bad-host.test')).toBe(true)
    expect(set.has('# comment')).toBe(false)
  })

  it('blocks an exact host match (AC-44)', () => {
    expect(isHostBlocked('https://evil.com/path', set)).toBe(true)
    expect(isHostBlocked('http://phishing.example.com', set)).toBe(true)
  })

  it('blocks subdomains of a blocked parent domain', () => {
    expect(isHostBlocked('https://login.evil.com/steal', set)).toBe(true)
    expect(isHostBlocked('https://deep.sub.evil.com/', set)).toBe(true)
  })

  it('ignores leading www on the candidate', () => {
    expect(isHostBlocked('https://www.evil.com/', set)).toBe(true)
  })

  it('does not block unrelated hosts', () => {
    expect(isHostBlocked('https://example.com/', set)).toBe(false)
    expect(isHostBlocked('https://notevil.com/', set)).toBe(false)
    expect(isHostBlocked('https://evil.com.good.com/', set)).toBe(false)
  })

  it('returns false for malformed URLs (handled by validation, not here)', () => {
    expect(isHostBlocked('not a url', set)).toBe(false)
  })
})
