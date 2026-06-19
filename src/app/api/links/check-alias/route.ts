/**
 * GET /api/links/check-alias?alias=  (G) — debounced live availability check
 * (FR-44, AC-4). Returns { available, reason?, suggestions? }. Rate-limited to
 * resist enumeration abuse (shares the shorten limiter budget loosely).
 * ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle } from '@/lib/route-helpers'
import { validateAliasSyntax, normalizeAlias } from '@/lib/alias'
import { codeExists, freeSuggestions } from '@/lib/links-service'
import { checkShortenLimit } from '@/lib/ratelimit'
import { ApiError } from '@/lib/errors'
import { clientIp } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const alias = req.nextUrl.searchParams.get('alias') ?? ''

    const rl = await checkShortenLimit(clientIp(req))
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': String(rl.retryAfterSec) } })
    }

    const syntax = validateAliasSyntax(alias)
    if (!syntax.ok) {
      return NextResponse.json({ available: false, reason: syntax.reason })
    }
    const lower = normalizeAlias(alias)
    if (await codeExists(lower)) {
      return NextResponse.json({
        available: false,
        reason: 'taken',
        suggestions: await freeSuggestions(alias),
      })
    }
    return NextResponse.json({ available: true })
  })
}
