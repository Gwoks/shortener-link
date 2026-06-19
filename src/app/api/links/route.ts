/**
 * POST /api/links  (G) — create a link (registered or guest).
 * GET  /api/links  (S) — list the current user's links (search/filter/sort/page).
 * ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { createLinkSchema } from '@/lib/validation/link'
import { createLink } from '@/lib/links-service'
import { serializeLink } from '@/lib/serialize'
import { currentUserId, requireUserId } from '@/lib/session'
import { checkShortenLimit } from '@/lib/ratelimit'
import { ApiError } from '@/lib/errors'
import { clientIp, getCookie, GUEST_COOKIE } from '@/lib/request'
import { guestKeyHash } from '@/lib/hash'
import { enqueueScrape } from '@/lib/scrape-queue'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handle(async () => {
    const input = await parseJson(req, createLinkSchema)
    const ip = clientIp(req)

    // Per-IP shorten rate limit (FR-35, AC-43).
    const rl = await checkShortenLimit(ip)
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': String(rl.retryAfterSec) } })
    }

    const userId = await currentUserId()

    // Guest identity (FR-33/34): mint a guest cookie on first guest shorten.
    let guestId = getCookie(req, GUEST_COOKIE)
    let setGuestCookie = false
    if (!userId) {
      if (!guestId) {
        guestId = randomUUID()
        setGuestCookie = true
      }
    }

    const link = await createLink({
      url: input.url,
      alias: input.alias,
      expiresAt: input.expiresAt ?? null,
      maxClicks: input.maxClicks ?? null,
      password: input.password ?? null,
      utm: input.utm ?? null,
      ownerId: userId,
      isGuest: !userId,
      guestKey: !userId && guestId ? guestKeyHash(guestId) : null,
      guestTtlHours: env.guestTtlHours,
    })

    // Kick off async metadata scrape (FR-19) — never blocks create.
    await enqueueScrape(link.id, link.destinationUrl)

    const res = NextResponse.json({ link: serializeLink(link) }, { status: 201 })
    if (setGuestCookie && guestId) {
      res.cookies.set(GUEST_COOKIE, guestId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProd,
        path: '/',
        maxAge: env.guestTtlHours * 3600,
      })
    }
    return res
  })
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId()
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() || undefined
    const status = sp.get('status') || undefined
    const sort = sp.get('sort') === 'clicks' ? 'clicks' : 'created'
    const order = sp.get('order') === 'asc' ? 'asc' : 'desc'
    const page = Math.max(1, Number.parseInt(sp.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('pageSize') || '20', 10) || 20))

    const where: Prisma.LinkWhereInput = { ownerId: userId }
    const now = new Date()
    if (status === 'active') {
      where.status = 'ACTIVE'
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }]
    } else if (status === 'expired') {
      where.OR = [{ status: 'EXPIRED' }, { status: 'DEACTIVATED' }, { expiresAt: { lte: now } }]
    } else if (status === 'expiring') {
      const soon = new Date(now.getTime() + 24 * 3600 * 1000)
      where.status = 'ACTIVE'
      where.expiresAt = { gt: now, lte: soon }
    } else if (status === 'protected') {
      where.passwordHash = { not: null }
    }
    if (q) {
      where.AND = [
        {
          OR: [
            { code: { contains: q.toLowerCase() } },
            { destinationUrl: { contains: q, mode: 'insensitive' } },
            { metaTitle: { contains: q, mode: 'insensitive' } },
          ],
        },
      ]
    }

    const orderBy: Prisma.LinkOrderByWithRelationInput =
      sort === 'clicks' ? { clickCount: order } : { createdAt: order }

    const [items, total] = await Promise.all([
      prisma.link.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.link.count({ where }),
    ])

    return NextResponse.json({
      items: items.map(serializeLink),
      page,
      pageSize,
      total,
    })
  })
}
