import { describe, it, expect } from 'vitest'
import { assembleUtmUrl, hasUtm } from '@/lib/utm'

describe('UTM assembly (FR-22/23, AC-30)', () => {
  it('appends utm params to a bare URL', () => {
    const out = assembleUtmUrl('https://example.com/p', {
      source: 'newsletter',
      medium: 'email',
      campaign: 'spring',
    })
    const u = new URL(out)
    expect(u.searchParams.get('utm_source')).toBe('newsletter')
    expect(u.searchParams.get('utm_medium')).toBe('email')
    expect(u.searchParams.get('utm_campaign')).toBe('spring')
  })

  it('preserves existing query params and fragment', () => {
    const out = assembleUtmUrl('https://example.com/p?ref=1#section', { source: 'x' })
    const u = new URL(out)
    expect(u.searchParams.get('ref')).toBe('1')
    expect(u.searchParams.get('utm_source')).toBe('x')
    expect(u.hash).toBe('#section')
  })

  it('drops empty utm values', () => {
    const out = assembleUtmUrl('https://example.com/p', { source: '', medium: '   ', campaign: 'c' })
    const u = new URL(out)
    expect(u.searchParams.has('utm_source')).toBe(false)
    expect(u.searchParams.has('utm_medium')).toBe(false)
    expect(u.searchParams.get('utm_campaign')).toBe('c')
  })

  it('overwrites an existing utm param', () => {
    const out = assembleUtmUrl('https://example.com/p?utm_source=old', { source: 'new' })
    expect(new URL(out).searchParams.get('utm_source')).toBe('new')
  })

  it('returns the input unchanged when no utm is given', () => {
    expect(assembleUtmUrl('https://example.com/p', null)).toBe('https://example.com/p')
    expect(assembleUtmUrl('https://example.com/p', {})).toBe('https://example.com/p')
  })

  it('returns input unchanged for an unparseable URL', () => {
    expect(assembleUtmUrl('not-a-url', { source: 'x' })).toBe('not-a-url')
  })

  it('hasUtm reflects whether any field is set', () => {
    expect(hasUtm(null)).toBe(false)
    expect(hasUtm({})).toBe(false)
    expect(hasUtm({ source: '' })).toBe(false)
    expect(hasUtm({ campaign: 'c' })).toBe(true)
  })
})
