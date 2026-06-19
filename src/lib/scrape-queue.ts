/**
 * Metadata-scrape job queue (ARCHITECTURE.md §2.2.D). The create API enqueues a
 * job; the worker consumes and performs the SSRF-safe scrape. A simple Redis
 * list (RPUSH/BLPOP) is sufficient — a dropped scrape just yields the
 * scrape-failed fallback (AC-26), so at-most-once is acceptable. Enqueue is
 * best-effort and never blocks or fails the create response.
 */
import { getRedis } from './redis'

export const SCRAPE_QUEUE = 'scrape:jobs'

export interface ScrapeJob {
  linkId: string
  url: string
}

export async function enqueueScrape(linkId: string, url: string): Promise<void> {
  try {
    await getRedis().rpush(SCRAPE_QUEUE, JSON.stringify({ linkId, url } satisfies ScrapeJob))
  } catch {
    /* best-effort; metadata stays PENDING and the row shows the fallback */
  }
}
