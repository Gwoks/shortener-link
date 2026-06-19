import { describe, it, expect } from 'vitest'
import { parseUserAgent } from '@/lib/ua'

describe('user-agent parsing (FR-7)', () => {
  it('detects a desktop browser', () => {
    const r = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    )
    expect(r.deviceType).toBe('desktop')
    expect(r.browser).toBe('Chrome')
  })

  it('detects a mobile device', () => {
    const r = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(r.deviceType).toBe('mobile')
  })

  it('flags bots/crawlers', () => {
    expect(parseUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)').deviceType).toBe('bot')
    expect(parseUserAgent('facebookexternalhit/1.1').deviceType).toBe('bot')
    expect(parseUserAgent('curl/8.4.0').deviceType).toBe('bot')
  })

  it('handles empty/missing UA gracefully', () => {
    expect(parseUserAgent(null)).toEqual({ deviceType: 'desktop', browser: null })
    expect(parseUserAgent('')).toEqual({ deviceType: 'desktop', browser: null })
  })
})
