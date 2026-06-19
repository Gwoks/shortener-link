import { describe, it, expect } from 'vitest'
import { isValidHttpUrl, httpUrlSchema } from '@/lib/validation/url'

describe('URL validation (FR-5, AC-7)', () => {
  it('accepts well-formed http/https URLs', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true)
    expect(isValidHttpUrl('http://example.com/very/long?utm_source=x')).toBe(true)
    expect(isValidHttpUrl('https://sub.domain.co.uk/path#frag')).toBe(true)
  })

  it('rejects dangerous schemes (AC-7)', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isValidHttpUrl('data:text/html,<script>1</script>')).toBe(false)
    expect(isValidHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isValidHttpUrl('ftp://example.com')).toBe(false)
  })

  it('rejects malformed / non-URL strings (AC-7)', () => {
    expect(isValidHttpUrl('not-a-url')).toBe(false)
    expect(isValidHttpUrl('')).toBe(false)
    expect(isValidHttpUrl('http://')).toBe(false)
    expect(isValidHttpUrl('https://no-dot-host')).toBe(false)
  })

  it('allows localhost (for local/dev destinations)', () => {
    expect(isValidHttpUrl('http://localhost:3000/x')).toBe(true)
  })

  it('zod schema mirrors the predicate and trims', () => {
    expect(httpUrlSchema.safeParse('  https://example.com  ').success).toBe(true)
    expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(httpUrlSchema.safeParse('not-a-url').success).toBe(false)
  })
})
