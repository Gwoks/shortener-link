/**
 * GET /api/links/{id}/qr?size=sm|md|lg&download=0|1  (S) — QR PNG for an owned
 * link (FR-12/13). Inline by default; download sets Content-Disposition.
 * ARCHITECTURE.md §4.3, §6.2.
 */
import { type NextRequest } from 'next/server'
import { apiError } from '@/lib/errors'
import { requireUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { generateQrPng, isQrSize, type QrSize } from '@/lib/qr'
import { shortUrlForCode } from '@/lib/serialize'
import { ApiError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId()
    const link = await prisma.link.findUnique({ where: { id: params.id } })
    if (!link) throw new ApiError('NOT_FOUND')
    if (link.ownerId !== userId) throw new ApiError('FORBIDDEN')

    const sizeParam = req.nextUrl.searchParams.get('size')
    const size: QrSize = isQrSize(sizeParam) ? sizeParam : 'md'
    const download = req.nextUrl.searchParams.get('download') === '1'

    const displayCode = link.aliasDisplay ?? link.code
    const png = await generateQrPng(shortUrlForCode(displayCode), size)

    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=3600',
    }
    if (download) {
      headers['Content-Disposition'] = `attachment; filename="qr-${displayCode}-${size}.png"`
    }
    return new Response(new Uint8Array(png), { status: 200, headers })
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse()
    console.error('[qr] error:', err)
    return apiError('INTERNAL')
  }
}
