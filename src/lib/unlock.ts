/**
 * Password-unlock session tokens (ARCHITECTURE.md §4.4, FR-17, AC-23, AC-25).
 * After a correct password, we set a short-lived httpOnly cookie carrying an
 * HMAC-signed token bound to the code + an expiry. The hot redirect path can
 * verify it cheaply (no Redis round-trip) to avoid re-prompting on refresh and
 * to know the click should be counted on the post-unlock redirect.
 *
 * Pure sign/verify (crypto only) so it is unit-testable without a server.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env'

function sign(payload: string): string {
  return createHmac('sha256', env.nextAuthSecret).update(payload).digest('base64url')
}

/** Create a token valid until `now + ttlSec*1000` for the given code. */
export function createUnlockToken(code: string, now: number, ttlSec: number): string {
  const exp = now + ttlSec * 1000
  const payload = `${code.toLowerCase()}.${exp}`
  return `${exp}.${sign(payload)}`
}

/** Verify a token belongs to `code` and has not expired. Pure & constant-time. */
export function verifyUnlockToken(token: string | null | undefined, code: string, now: number): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number.parseInt(expStr, 10)
  if (!Number.isFinite(exp) || exp <= now) return false
  const expected = sign(`${code.toLowerCase()}.${exp}`)
  if (expected.length !== sig.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}
