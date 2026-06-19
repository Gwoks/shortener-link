/**
 * GET /api/qr/{code}?size=sm|md|lg&download=0|1  (P) — QR PNG by short code,
 * used by the guest result card which has the code (not an owned id). The QR
 * only ever encodes the public short URL, so no authorization is needed; it
 * 404s for codes that don't exist. ARCHITECTURE.md §4.3.
 */
import { type NextRequest } from 'next/server'
import { apiError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { generateQrPng, isQrSize, type QrSize } from '@/lib/qr'
import { shortUrlForCode } from '@/lib/serialize'
import { normalizeAlias } from '@/lib/alias'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const link = await prisma.link.findUnique({
      where: { code: normalizeAlias(params.code) },
      select: { code: true, aliasDisplay: true },
    })
    if (!link) return apiError('NOT_FOUND')

    const sizeParam = req.nextUrl.searchParams.get('size')
    const size: QrSize = isQrSize(sizeParam) ? sizeParam : 'md'
    const download = req.nextUrl.searchParams.get('download') === '1'
    const displayCode = link.aliasDisplay ?? link.code

    const png = await generateQrPng(shortUrlForCode(displayCode), size)
    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    }
    if (download) headers['Content-Disposition'] = `attachment; filename="qr-${displayCode}-${size}.png"`
    return new Response(new Uint8Array(png), { status: 200, headers })
  } catch (err) {
    console.error('[qr-code] error:', err)
    return apiError('INTERNAL')
  }
}
