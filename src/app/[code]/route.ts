/**
 * GET /:code — the HOT redirect path (ARCHITECTURE.md §2.2.A, §8.1).
 *
 * Budget: at most one Redis GET (+ one atomic INCR when maxClicks is set) + one
 * fire-and-forget XADD on a cache hit. NO Postgres / Prisma / Auth.js on a hit.
 * On a counted redirect the click is enqueued asynchronously and the response
 * returns WITHOUT awaiting durable analytics.
 *
 * Outcomes:
 *   302/301 -> active redirect (click counted)
 *   redirect to /:code/gate (200 page) -> password gate (no click)
 *   redirect to /dead-link?reason=... (410-class) -> expired/deactivated/max-clicks
 *   redirect to /dead-link?reason=not-found (404-class) -> never existed / deleted
 *
 * We render the gate/dead-link as frontend-owned pages via internal rewrites so
 * the clicker sees an on-brand page (FR-38/39) while the status code reflects
 * the situation for crawlers/tests.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveForRedirect } from '@/lib/links-service'
import { resolve, type RedirectContext } from '@/lib/redirect'
import { incrClickCount } from '@/lib/cache'
import { enqueueClick } from '@/lib/events'
import { verifyUnlockToken } from '@/lib/unlock'
import { env } from '@/lib/env'
import { clientIp, getCookie, unlockCookieName, VID_COOKIE } from '@/lib/request'
import { deadLinkHtml, gateHtml } from '@/lib/clicker-pages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CODE = /^[A-Za-z0-9_-]{3,50}$/

// App Router route handlers cannot use NextResponse.rewrite(), so we serve the
// on-brand clicker pages directly as HTML with the exact binding status code
// (FR-38, A-DEADLINK, ARCHITECTURE §6.2).
function htmlResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  })
}

function deadResponse(reason: string, status: 404 | 410): NextResponse {
  return htmlResponse(deadLinkHtml(reason), status)
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code

  // Cheap shape check; reserved roots are real routes and never reach here.
  if (!ALLOWED_CODE.test(code)) {
    return deadResponse('not-found', 404)
  }

  const now = Date.now()
  const { link } = await resolveForRedirect(code)

  const unlocked = link?.hasPassword
    ? verifyUnlockToken(getCookie(req, unlockCookieName(code)), code, now)
    : false

  // For max-clicks, use the authoritative live counter (peek without spending).
  const ctx: RedirectContext = { now, unlocked }

  const decision = resolve(link, ctx)

  switch (decision.kind) {
    case 'not-found':
      return deadResponse('not-found', 404)
    case 'dead':
      return deadResponse(decision.reason, 410)
    case 'gate': {
      // Serve the on-brand password gate page (200). No click counted.
      return htmlResponse(gateHtml(code), 200)
    }
    case 'redirect': {
      // Enforce max-clicks atomically when a cap exists: the (K+1)th hit is
      // denied without a DB round-trip (§4.4, AC-21).
      if (link && link.maxClicks != null) {
        const live = await incrClickCount(code, link.clickCount)
        if (live != null && live > link.maxClicks) {
          return deadResponse('max-clicks', 410)
        }
      }

      // Fire-and-forget click enqueue (NOT awaited for durability) — but we do
      // await the XADD call itself since it's a single fast Redis op; failures
      // are swallowed and never block the redirect (§8.1).
      void enqueueClick({
        linkId: link!.id,
        code,
        occurredAt: now,
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
        referer: req.headers.get('referer'),
        vidCookie: getCookie(req, VID_COOKIE),
      })

      const res = NextResponse.redirect(decision.destination, env.redirectStatus)
      // 302 default + no-store so analytics aren't undercounted by caching
      // (A-REDIR, §0).
      res.headers.set('Cache-Control', 'private, no-store')

      // Ensure an analytics cookie exists for cookie-first unique counting
      // (A-UNIQUE) without identifying the user.
      if (!getCookie(req, VID_COOKIE)) {
        res.cookies.set(VID_COOKIE, cryptoRandomId(), {
          httpOnly: true,
          sameSite: 'lax',
          secure: env.isProd,
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        })
      }
      return res
    }
  }
}

function cryptoRandomId(): string {
  // Avoid importing node:crypto on the hot path's top level; use Web Crypto.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
