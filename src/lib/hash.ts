/**
 * Password hashing (argon2id) + privacy-preserving visitor-key hashing
 * (ARCHITECTURE.md §4.6, NFR-5, A-PII). Raw IPs are NEVER stored or logged:
 * we truncate (IPv4 /24, IPv6 /48) then HMAC-SHA256 with a server pepper + a
 * daily salt. The truncation is pure & unit-tested; argon2 is dynamically
 * imported so pure tests don't need the native module.
 */
import { createHmac, createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { env } from './env'

// ─── Account / link password hashing (argon2id) ──────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  const argon2 = (await import('argon2')).default
  return argon2.hash(plain, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    const argon2 = (await import('argon2')).default
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

// ─── Visitor-key hashing (A-PII) ─────────────────────────────────────────────

/**
 * Truncate an IP to its network prefix: IPv4 /24 (drop last octet), IPv6 /48
 * (keep first 3 hextets). Pure. Returns a canonical truncated string used only
 * as HMAC input — never persisted on its own.
 */
export function truncateIp(ip: string): string {
  const family = isIP(ip)
  if (family === 4) {
    const parts = ip.split('.')
    if (parts.length !== 4) return ip
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }
  if (family === 6) {
    // Expand minimally and keep the first 3 groups (/48).
    const groups = ip.split(':')
    const head = groups.slice(0, 3).join(':')
    return `${head}::/48`
  }
  // Unknown shape — hash as-is (still peppered downstream).
  return ip
}

/** UTC day stamp (YYYY-MM-DD) used as the daily salt component. */
export function dayStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/**
 * Compute the stored visitor key. Cookie-first (A-UNIQUE): if a stable analytics
 * cookie id is present, it is the basis; otherwise fall back to truncated-IP +
 * UA. Always HMAC'd with the server pepper and a daily salt so the key rotates
 * daily and cannot be reversed to an IP.
 */
export function visitorKey(opts: {
  cookieId?: string | null
  ip?: string | null
  userAgent?: string | null
  now: number
}): string {
  const salt = dayStamp(opts.now)
  let basis: string
  if (opts.cookieId && opts.cookieId.trim() !== '') {
    basis = `c:${opts.cookieId}`
  } else {
    const ipPart = opts.ip ? truncateIp(opts.ip) : 'noip'
    const uaHash = createHash('sha256')
      .update(opts.userAgent ?? '')
      .digest('hex')
      .slice(0, 16)
    basis = `i:${ipPart}|${uaHash}`
  }
  return createHmac('sha256', env.visitorIpPepper).update(`${salt}|${basis}`).digest('hex')
}

/**
 * Hash used for rate-limit keying and guest-claim keys: stable per truncated IP
 * (not daily-rotated, since limits/claims must persist within their window).
 */
export function ipHash(ip: string | null | undefined): string {
  const basis = ip ? truncateIp(ip) : 'noip'
  return createHmac('sha256', env.visitorIpPepper).update(`rl|${basis}`).digest('hex').slice(0, 32)
}

/** Hash a guest cookie id into the stored guestKey (FR-34). */
export function guestKeyHash(guestId: string): string {
  return createHmac('sha256', env.visitorIpPepper).update(`guest|${guestId}`).digest('hex')
}
