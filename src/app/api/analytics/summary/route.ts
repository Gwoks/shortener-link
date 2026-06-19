/**
 * GET /api/analytics/summary?range=  (S) — aggregate analytics across all of a
 * user's links (FR-8, AC-13). ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle } from '@/lib/route-helpers'
import { requireUserId } from '@/lib/session'
import { getSummaryAnalytics, type Range } from '@/lib/analytics-service'

export const dynamic = 'force-dynamic'

function parseRange(v: string | null): Range {
  return v === '7d' || v === '90d' || v === 'all' ? v : '30d'
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId()
    const range = parseRange(req.nextUrl.searchParams.get('range'))
    const data = await getSummaryAnalytics(userId, range, Date.now())
    return NextResponse.json(data)
  })
}
