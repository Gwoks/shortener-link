/**
 * POST /api/guest-links/claim  (S) — claim guest links into the account (FR-34,
 * AC-42). Body { ids }. Sets ownerId, clears isGuest, and nulls the 24h guest
 * expiry. Only links matching this browser's guest cookie are claimable (no
 * cross-account theft). Invalidates the redirect cache so the resolved record
 * reflects the new ownership/expiry. ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { claimSchema } from '@/lib/validation/link'
import { requireUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getCookie, GUEST_COOKIE } from '@/lib/request'
import { guestKeyHash } from '@/lib/hash'
import { invalidateRedirect } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId()
    const { ids } = await parseJson(req, claimSchema)
    const guestId = getCookie(req, GUEST_COOKIE)
    if (!guestId) return NextResponse.json({ claimed: 0 })

    const guestKey = guestKeyHash(guestId)
    const now = new Date()

    // Only claim links that are this browser's still-live guest links.
    const claimable = await prisma.link.findMany({
      where: {
        id: { in: ids },
        isGuest: true,
        ownerId: null,
        guestKey,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, code: true },
    })

    if (claimable.length === 0) return NextResponse.json({ claimed: 0 })

    await prisma.link.updateMany({
      where: { id: { in: claimable.map((l) => l.id) } },
      data: { ownerId: userId, isGuest: false, guestKey: null, expiresAt: null },
    })

    // Invalidate cached resolutions so the cleared expiry takes effect.
    await Promise.all(claimable.map((l) => invalidateRedirect(l.code)))

    return NextResponse.json({ claimed: claimable.length })
  })
}
