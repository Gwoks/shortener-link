/**
 * Route protection (ARCHITECTURE.md §4.1). Guards the authenticated app shell
 * and settings, redirecting unauthenticated users to /signin with a callback.
 *
 * This is a lightweight cookie-presence gate only — it runs on the Edge runtime
 * where Prisma/argon2 are unavailable, so it deliberately does NOT fully verify
 * the session. Every API handler and server component re-checks authorization
 * server-side via `auth()` (never trusts the middleware alone).
 */
import { NextResponse, type NextRequest } from 'next/server'

// Auth.js session cookie names (v5): `authjs.session-token`, secure variant
// `__Secure-authjs.session-token`.
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

const PROTECTED_PREFIXES = ['/app', '/dashboard', '/settings']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!isProtected) return NextResponse.next()

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name))
  if (hasSession) return NextResponse.next()

  const url = new URL('/signin', req.nextUrl.origin)
  url.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/app/:path*', '/dashboard/:path*', '/settings/:path*'],
}
