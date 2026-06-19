/**
 * GET /api/links/{id}/analytics?range=7d|30d|90d|all  (S) — per-link analytics
 * (FR-7, AC-10/11/14/16). Requires ownership; returns 403 for guest/non-owned
 * links (guest links have no analytics endpoint — FR-10/AC-15). Works for
 * expired/deactivated links too (AC-14). ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle } from '@/lib/route-helpers'
import { requireUserId } from '@/lib/session'
import { ApiError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { getLinkAnalytics, type Range } from '@/lib/analytics-service'

export const dynamic = 'force-dynamic'

function parseRange(v: string | null): Range {
  return v === '7d' || v === '90d' || v === 'all' ? v : '30d'
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId()
    const link = await prisma.link.findUnique({ where: { id: params.id }, select: { id: true, ownerId: true } })
    if (!link) throw new ApiError('NOT_FOUND')
    if (link.ownerId !== userId) throw new ApiError('FORBIDDEN')

    const range = parseRange(req.nextUrl.searchParams.get('range'))
    const data = await getLinkAnalytics(link.id, range, Date.now())
    return NextResponse.json(data)
  })
}
