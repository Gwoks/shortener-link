/**
 * Request-context helpers (ARCHITECTURE.md §4.2/4.6). Extracts the client IP
 * from proxy headers (best-effort) and provides cookie name constants. Raw IPs
 * are used only transiently for hashing/rate-limiting and never persisted.
 */
import type { NextRequest } from 'next/server'

export const GUEST_COOKIE = 'guest_id'
export const VID_COOKIE = 'vid' // analytics unique-visitor cookie (A-UNIQUE)
export const unlockCookieName = (code: string) => `unlock_${code.toLowerCase()}`

/**
 * Best-effort client IP. Honors X-Forwarded-For (first hop) then X-Real-IP.
 * Behind docker-compose / a reverse proxy this is the real client; locally it
 * may be undefined, in which case callers use a stable fallback key.
 */
export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

export function getCookie(req: NextRequest, name: string): string | null {
  return req.cookies.get(name)?.value ?? null
}
