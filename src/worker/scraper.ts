/**
 * Metadata scraper worker (ARCHITECTURE.md §2.2.D, FR-19, AC-26/27). Consumes
 * scrape jobs from the Redis list, performs an SSRF-safe outbound fetch, parses
 * <title> and <meta description>, and updates the link's metaTitle/Description/
 * metaStatus. SSRF violations or any failure → metaStatus=FAILED (the link was
 * already created; AC-27). Never touches link creation.
 */
import { parse } from 'node-html-parser'
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { SCRAPE_QUEUE, type ScrapeJob } from '@/lib/scrape-queue'
import { safeFetch } from '@/lib/ssrf'

/** Extract title + description from HTML. Pure-ish (DOM parse only). */
export function extractMeta(html: string): { title: string | null; description: string | null } {
  const root = parse(html)
  const title = root.querySelector('title')?.text?.trim() || null

  let description: string | null = null
  const metas = root.querySelectorAll('meta')
  for (const m of metas) {
    const name = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase()
    if (name === 'description' || name === 'og:description') {
      const content = m.getAttribute('content')?.trim()
      if (content) {
        description = content
        if (name === 'description') break // prefer the standard description
      }
    }
  }
  return {
    title: title ? title.slice(0, 300) : null,
    description: description ? description.slice(0, 600) : null,
  }
}

/** Scrape a single job and persist the result. Never throws. */
export async function processScrapeJob(job: ScrapeJob): Promise<void> {
  try {
    const result = await safeFetch(job.url)
    if (!result.ok) {
      await markFailed(job.linkId)
      return
    }
    const meta = extractMeta(result.body)
    await prisma.link.update({
      where: { id: job.linkId },
      data: {
        metaTitle: meta.title,
        metaDescription: meta.description,
        metaStatus: meta.title || meta.description ? 'READY' : 'FAILED',
      },
    })
  } catch {
    await markFailed(job.linkId)
  }
}

async function markFailed(linkId: string): Promise<void> {
  try {
    await prisma.link.update({ where: { id: linkId }, data: { metaStatus: 'FAILED' } })
  } catch {
    /* link may have been deleted; ignore */
  }
}

/** Run the scrape consumer loop until aborted. */
export async function runScraper(signal: AbortSignal): Promise<void> {
  const redis = getRedis()
  console.log('[worker] scraper started')
  while (!signal.aborted) {
    let popped: [string, string] | null = null
    try {
      popped = (await redis.blpop(SCRAPE_QUEUE, 2)) as [string, string] | null
    } catch (err) {
      if (signal.aborted) break
      console.error('[worker] scraper blpop error:', (err as Error).message)
      await sleep(1000)
      continue
    }
    if (!popped) continue
    try {
      const job = JSON.parse(popped[1]) as ScrapeJob
      await processScrapeJob(job)
    } catch (err) {
      console.error('[worker] scrape job error:', (err as Error).message)
    }
  }
  console.log('[worker] scraper stopped')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
