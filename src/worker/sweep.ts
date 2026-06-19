/**
 * Expiry / guest-TTL sweep (ARCHITECTURE.md §2.2.E, NFR-12). Periodically flips
 * ACTIVE links whose expiresAt has passed (including 24h-guest TTL, since guest
 * links carry an expiresAt) to EXPIRED, and invalidates their cache entries.
 * Redirect-time checks remain the authoritative guard; this keeps dashboards
 * and listings honest and prevents the negative cache from masking a stale row.
 */
import { prisma } from '@/lib/db'
import { invalidateRedirect } from '@/lib/cache'

const SWEEP_INTERVAL_MS = 60_000

/** One sweep pass. Returns the number of links expired. */
export async function sweepOnce(now: Date = new Date()): Promise<number> {
  const due = await prisma.link.findMany({
    where: { status: 'ACTIVE', expiresAt: { not: null, lte: now } },
    select: { id: true, code: true },
    take: 1000,
  })
  if (due.length === 0) return 0

  await prisma.link.updateMany({
    where: { id: { in: due.map((l) => l.id) } },
    data: { status: 'EXPIRED' },
  })
  await Promise.all(due.map((l) => invalidateRedirect(l.code)))
  console.log(`[worker] sweep expired ${due.length} link(s)`)
  return due.length
}

/** Run the sweep loop until aborted. */
export async function runSweep(signal: AbortSignal): Promise<void> {
  console.log('[worker] expiry sweep started')
  while (!signal.aborted) {
    try {
      await sweepOnce()
    } catch (err) {
      console.error('[worker] sweep error:', (err as Error).message)
    }
    await sleep(SWEEP_INTERVAL_MS, signal)
  }
  console.log('[worker] expiry sweep stopped')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })
}
