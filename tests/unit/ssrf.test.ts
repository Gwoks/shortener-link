import { describe, it, expect } from 'vitest'
import { isBlockedIp, validateOutboundUrl } from '@/lib/ssrf'

describe('SSRF IP classifier (NFR-6, AC-27)', () => {
  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true)
    expect(isBlockedIp('127.255.255.254')).toBe(true)
    expect(isBlockedIp('::1')).toBe(true)
  })

  it('blocks private ranges (10/8, 172.16/12, 192.168/16)', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true)
    expect(isBlockedIp('10.255.255.255')).toBe(true)
    expect(isBlockedIp('172.16.0.1')).toBe(true)
    expect(isBlockedIp('172.31.255.255')).toBe(true)
    expect(isBlockedIp('192.168.1.1')).toBe(true)
  })

  it('does NOT block 172.32.x (just outside the private block)', () => {
    expect(isBlockedIp('172.32.0.1')).toBe(false)
  })

  it('blocks link-local incl. cloud metadata 169.254.169.254', () => {
    expect(isBlockedIp('169.254.0.1')).toBe(true)
    expect(isBlockedIp('169.254.169.254')).toBe(true)
  })

  it('blocks CGN, benchmarking, multicast, reserved', () => {
    expect(isBlockedIp('100.64.0.1')).toBe(true)
    expect(isBlockedIp('198.18.0.1')).toBe(true)
    expect(isBlockedIp('224.0.0.1')).toBe(true)
    expect(isBlockedIp('240.0.0.1')).toBe(true)
    expect(isBlockedIp('0.0.0.0')).toBe(true)
  })

  it('blocks IPv6 link-local / ULA / multicast', () => {
    expect(isBlockedIp('fe80::1')).toBe(true)
    expect(isBlockedIp('fc00::1')).toBe(true)
    expect(isBlockedIp('fd12:3456::1')).toBe(true)
    expect(isBlockedIp('ff02::1')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 pointing at a private addr', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true)
  })

  it('allows clearly-public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp('1.1.1.1')).toBe(false)
    expect(isBlockedIp('93.184.216.34')).toBe(false) // example.com
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false) // cloudflare v6
  })

  it('refuses garbage as not-an-IP', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true)
    expect(isBlockedIp('')).toBe(true)
  })
})

describe('validateOutboundUrl (NFR-6)', () => {
  it('accepts http/https public-shaped URLs', () => {
    expect(validateOutboundUrl('https://example.com/page').ok).toBe(true)
    expect(validateOutboundUrl('http://example.com').ok).toBe(true)
  })

  it('rejects non-http(s) schemes', () => {
    expect(validateOutboundUrl('javascript:alert(1)')).toMatchObject({ ok: false, reason: 'bad-scheme' })
    expect(validateOutboundUrl('file:///etc/passwd')).toMatchObject({ ok: false, reason: 'bad-scheme' })
    expect(validateOutboundUrl('ftp://example.com')).toMatchObject({ ok: false, reason: 'bad-scheme' })
  })

  it('rejects IP-literal hosts in private ranges', () => {
    expect(validateOutboundUrl('http://127.0.0.1/')).toMatchObject({ ok: false, reason: 'blocked-ip' })
    expect(validateOutboundUrl('http://169.254.169.254/latest/meta-data')).toMatchObject({
      ok: false,
      reason: 'blocked-ip',
    })
  })

  it('rejects localhost-style hostnames', () => {
    expect(validateOutboundUrl('http://localhost:3000/').ok).toBe(false)
    expect(validateOutboundUrl('http://foo.local/').ok).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(validateOutboundUrl('not a url')).toMatchObject({ ok: false, reason: 'malformed-url' })
  })
})
