/**
 * POST /api/links/{code}/unlock  (P) — password-gate unlock (FR-17, AC-22/23/24/25).
 * Body { password }. On success sets a short-lived httpOnly unlock cookie and the
 * subsequent GET /:code 302s and counts the click (A-PWCOUNT). Independent
 * lockout/backoff limiter (FR-18, AC-24). ARCHITECTURE.md §6.2.
 *
 * NOTE: the dynamic segment is named `[id]` to share the segment name with the
 * sibling management routes, but for unlock the param value is the short CODE.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { unlockSchema } from '@/lib/validation/link'
import { ApiError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { normalizeAlias } from '@/lib/alias'
import { verifyPassword } from '@/lib/hash'
import { checkUnlockGate, recordUnlockFailure, clearUnlockFailures } from '@/lib/ratelimit'
import { createUnlockToken } from '@/lib/unlock'
import { clientIp, unlockCookieName } from '@/lib/request'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const code = normalizeAlias(params.id)
    const { password } = await parseJson(req, unlockSchema)
    const ip = clientIp(req)

    const link = await prisma.link.findUnique({ where: { code } })
    if (!link) throw new ApiError('NOT_FOUND')
    if (link.status !== 'ACTIVE') throw new ApiError('NOT_FOUND') // dead links: no oracle
    if (!link.passwordHash) {
      // Not password-protected — nothing to unlock; treat as not found for this
      // endpoint (the redirect path handles it normally).
      throw new ApiError('NOT_FOUND')
    }

    // Independent unlock limiter / lockout (AC-24), keyed by link id + IP.
    const gate = await checkUnlockGate(link.id, ip)
    if (gate.locked) {
      throw new ApiError('UNLOCK_LOCKED', { headers: { 'Retry-After': String(gate.retryAfterSec) } })
    }

    const ok = await verifyPassword(link.passwordHash, password)
    if (!ok) {
      await recordUnlockFailure(link.id, ip)
      throw new ApiError('WRONG_PASSWORD')
    }

    await clearUnlockFailures(link.id, ip)

    const token = createUnlockToken(code, Date.now(), env.unlockSessionTtlSec)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(unlockCookieName(code), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      path: '/',
      maxAge: env.unlockSessionTtlSec,
    })
    return res
  })
}
