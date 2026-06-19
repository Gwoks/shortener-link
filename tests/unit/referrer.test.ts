import { describe, it, expect } from 'vitest'
import { categorizeReferrer } from '@/lib/referrer'

describe('referrer categorization (FR-7, AC-11)', () => {
  it('no Referer => DIRECT (AC-11)', () => {
    expect(categorizeReferrer(null)).toEqual({ category: 'DIRECT', host: null })
    expect(categorizeReferrer('')).toEqual({ category: 'DIRECT', host: null })
    expect(categorizeReferrer(undefined)).toEqual({ category: 'DIRECT', host: null })
  })

  it('facebook.com => SOCIAL (AC-11)', () => {
    const r = categorizeReferrer('https://facebook.com/some/post')
    expect(r.category).toBe('SOCIAL')
    expect(r.host).toBe('facebook.com')
  })

  it('strips www and matches subdomains as SOCIAL', () => {
    expect(categorizeReferrer('https://www.facebook.com/').category).toBe('SOCIAL')
    expect(categorizeReferrer('https://m.facebook.com/').category).toBe('SOCIAL')
    expect(categorizeReferrer('https://t.co/abc').category).toBe('SOCIAL')
  })

  it('google / bing / duckduckgo => SEARCH', () => {
    expect(categorizeReferrer('https://www.google.com/search?q=x').category).toBe('SEARCH')
    expect(categorizeReferrer('https://bing.com/').category).toBe('SEARCH')
    expect(categorizeReferrer('https://duckduckgo.com/').category).toBe('SEARCH')
  })

  it('an arbitrary site => REFERRAL', () => {
    const r = categorizeReferrer('https://news.ycombinator.com/item?id=1')
    expect(r.category).toBe('REFERRAL')
    expect(r.host).toBe('news.ycombinator.com')
  })

  it('unparseable referer => OTHER', () => {
    expect(categorizeReferrer('::::not a url')).toEqual({ category: 'OTHER', host: null })
  })
})
