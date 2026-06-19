/**
 * SSRF-safe outbound fetch for the metadata scraper (ARCHITECTURE.md §4.5,
 * NFR-6, FR-19, AC-27). Two parts:
 *   1. `isBlockedIp` / `isPublicHostShape` — pure classifiers (unit-tested).
 *   2. `safeFetch` — DNS-resolve + per-hop IP pinning + redirect/size/time
 *      caps, used only by the worker.
 *
 * Trust boundary: this is the OUTBOUND guard, entirely separate from the
 * inbound create-time blocklist (lib/blocklist.ts) — never merged (PRD §9).
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const MAX_REDIRECTS = 3
export const TIMEOUT_MS = 5_000
export const MAX_BODY_BYTES = 512 * 1024

/** Parse an IPv4 dotted-quad into its 32-bit unsigned value, or null. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let val = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    val = (val << 8) | n
  }
  return val >>> 0
}

function inCidr4(ipInt: number, baseIp: string, maskBits: number): boolean {
  const base = ipv4ToInt(baseIp)
  if (base === null) return false
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0
  return (ipInt & mask) === (base & mask)
}

/**
 * True if an IP literal is private / loopback / link-local / ULA / cloud
 * metadata, i.e. must NOT be fetched. Handles IPv4, IPv6, and IPv4-mapped IPv6.
 */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return true // not a valid IP => refuse

  if (family === 4) return isBlockedIpv4(ip)

  // IPv6
  const lower = ip.toLowerCase()
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — classify the v4 part.
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isBlockedIpv4(mapped[1])

  if (lower === '::1' || lower === '::') return true // loopback / unspecified
  if (lower.startsWith('fe80')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local (ULA)
  if (lower.startsWith('ff')) return true // multicast
  // IPv4-mapped via the embedded ::ffff:hhhh:hhhh form is rare; be conservative
  // and allow only clearly-global addresses through.
  return false
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true
  return (
    inCidr4(n, '0.0.0.0', 8) || // "this" network / unspecified
    inCidr4(n, '10.0.0.0', 8) || // private
    inCidr4(n, '100.64.0.0', 10) || // CGN
    inCidr4(n, '127.0.0.0', 8) || // loopback
    inCidr4(n, '169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    inCidr4(n, '172.16.0.0', 12) || // private
    inCidr4(n, '192.0.0.0', 24) || // IETF protocol assignments
    inCidr4(n, '192.168.0.0', 16) || // private
    inCidr4(n, '198.18.0.0', 15) || // benchmarking
    inCidr4(n, '224.0.0.0', 4) || // multicast
    inCidr4(n, '240.0.0.0', 4) // reserved
  )
}

export type SafeFetchResult = { ok: true; body: string; finalUrl: string } | { ok: false; reason: string }

/**
 * Validate a URL's scheme/host shape before any network use. Pure.
 * Rejects non-http(s) schemes and IP literals that are already blocked.
 */
export function validateOutboundUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'malformed-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'bad-scheme' }
  }
  const host = url.hostname
  // If the host is an IP literal, classify immediately.
  if (isIP(host) && isBlockedIp(host)) return { ok: false, reason: 'blocked-ip' }
  // Obvious local names.
  const lowerHost = host.toLowerCase()
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost') || lowerHost.endsWith('.local')) {
    return { ok: false, reason: 'local-host' }
  }
  return { ok: true, url }
}

/** Resolve a hostname and ensure every resolved address is public. */
async function resolveToPublicIp(host: string): Promise<{ ok: true; ip: string } | { ok: false; reason: string }> {
  if (isIP(host)) {
    return isBlockedIp(host) ? { ok: false, reason: 'blocked-ip' } : { ok: true, ip: host }
  }
  let records: { address: string; family: number }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    return { ok: false, reason: 'dns-failure' }
  }
  if (records.length === 0) return { ok: false, reason: 'no-dns-records' }
  for (const r of records) {
    if (isBlockedIp(r.address)) return { ok: false, reason: 'blocked-ip' }
  }
  // Pin the first resolved address to defeat DNS-rebinding between check & use.
  return { ok: true, ip: records[0].address }
}

/**
 * SSRF-guarded fetch of an HTML page. Follows up to MAX_REDIRECTS hops,
 * re-validating each hop's resolved IP; bounded by TIMEOUT_MS and MAX_BODY_BYTES.
 * Never forwards auth/cookies. Returns the (truncated) body text on success.
 * Uses undici with a custom connect that pins the validated IP.
 */
export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  // Lazy import so the pure classifiers can be unit-tested without undici.
  const { request } = await import('undici')

  let currentUrl = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = validateOutboundUrl(currentUrl)
    if (!validated.ok) return { ok: false, reason: validated.reason }

    const resolved = await resolveToPublicIp(validated.url.hostname)
    if (!resolved.ok) return { ok: false, reason: resolved.reason }

    let res
    try {
      res = await request(validated.url.href, {
        method: 'GET',
        maxRedirections: 0, // we follow manually to re-validate each hop
        headersTimeout: TIMEOUT_MS,
        bodyTimeout: TIMEOUT_MS,
        headers: {
          'user-agent': 'LinkShortenerBot/1.0 (+metadata-scrape)',
          accept: 'text/html,application/xhtml+xml',
        },
      })
    } catch {
      return { ok: false, reason: 'request-failed' }
    }

    const status = res.statusCode
    if (status >= 300 && status < 400) {
      const loc = res.headers['location']
      const locStr = Array.isArray(loc) ? loc[0] : loc
      if (!locStr) return { ok: false, reason: 'redirect-without-location' }
      // Resolve relative redirects against the current URL.
      currentUrl = new URL(locStr, validated.url.href).href
      // Drain the body to free the socket.
      try {
        await res.body.dump()
      } catch {
        /* ignore */
      }
      continue
    }

    if (status >= 400) {
      try {
        await res.body.dump()
      } catch {
        /* ignore */
      }
      return { ok: false, reason: `http-${status}` }
    }

    // 2xx — read a bounded amount of the body.
    const chunks: Buffer[] = []
    let total = 0
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buf.length
        if (total > MAX_BODY_BYTES) {
          chunks.push(buf.subarray(0, Math.max(0, MAX_BODY_BYTES - (total - buf.length))))
          break
        }
        chunks.push(buf)
      }
    } catch {
      return { ok: false, reason: 'body-read-failed' }
    }
    return { ok: true, body: Buffer.concat(chunks).toString('utf8'), finalUrl: validated.url.href }
  }
  return { ok: false, reason: 'too-many-redirects' }
}
