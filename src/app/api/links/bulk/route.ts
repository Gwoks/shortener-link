/**
 * POST /api/links/bulk  (S) — bulk shorten with partial success (FR-24/25/26,
 * NFR-4, AC-31/32/34). Body { urls: string[] }, max BULK_MAX. Returns one
 * result row per input; valid rows succeed, invalid/blocked rows carry a
 * per-row {code,message}. ARCHITECTURE.md §6.2, §8.4.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { bulkSchema } from '@/lib/validation/link'
import { httpUrlSchema } from '@/lib/validation/url'
import { requireUserId } from '@/lib/session'
import { ApiError, ERROR_DEFAULT_MESSAGE, type ErrorCode } from '@/lib/errors'
import { createLink } from '@/lib/links-service'
import { serializeLink, type LinkResource } from '@/lib/serialize'
import { enqueueScrape } from '@/lib/scrape-queue'
import { checkShortenLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/request'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

interface BulkRow {
  input: string
  ok: boolean
  link?: LinkResource
  error?: { code: ErrorCode; message: string }
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const userId = await requireUserId()
    const { urls } = await parseJson(req, bulkSchema)

    // Whole-batch limit (AC-34) — 413 BULK_LIMIT_EXCEEDED.
    if (urls.length > env.bulkMax) {
      throw new ApiError('BULK_LIMIT_EXCEEDED', {
        message: `Please submit at most ${env.bulkMax} URLs at a time.`,
      })
    }

    // One rate-limit charge per batch (FR-35).
    const rl = await checkShortenLimit(clientIp(req))
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': String(rl.retryAfterSec) } })
    }

    const results: BulkRow[] = []
    for (const raw of urls) {
      const input = raw.trim()
      if (input === '') continue
      const parsed = httpUrlSchema.safeParse(input)
      if (!parsed.success) {
        results.push({
          input,
          ok: false,
          error: { code: 'INVALID_URL', message: ERROR_DEFAULT_MESSAGE.INVALID_URL },
        })
        continue
      }
      try {
        const link = await createLink({
          url: parsed.data,
          ownerId: userId,
          isGuest: false,
        })
        await enqueueScrape(link.id, link.destinationUrl)
        results.push({ input, ok: true, link: serializeLink(link) })
      } catch (err) {
        if (err instanceof ApiError) {
          results.push({ input, ok: false, error: { code: err.code, message: err.message } })
        } else {
          results.push({
            input,
            ok: false,
            error: { code: 'INTERNAL', message: ERROR_DEFAULT_MESSAGE.INTERNAL },
          })
        }
      }
    }

    // 200 with partial-success accounting (AC-31/32) — the whole batch is not
    // rejected on individual failures.
    return NextResponse.json({ results })
  })
}
