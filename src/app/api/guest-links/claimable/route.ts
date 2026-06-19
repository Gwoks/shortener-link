/**
 * GET /api/guest-links/claimable  (S) — still-live guest links created by this
 * browser, eligible to claim (FR-34, AC-42). Reads the guest_id cookie, hashes
 * it to the stored guestKey, and returns matching live links. ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle } from '@/lib/route-helpers'
import { requireUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { serializeLink } from '@/lib/serialize'
import { getCookie, GUEST_COOKIE } from '@/lib/request'
import { guestKeyHash } from '@/lib/hash'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUserId()
    const guestId = getCookie(req, GUEST_COOKIE)
    if (!guestId) return NextResponse.json({ links: [] })

    const now = new Date()
    const links = await prisma.link.findMany({
      where: {
        isGuest: true,
        ownerId: null,
        guestKey: guestKeyHash(guestId),
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ links: links.map(serializeLink) })
  })
}
