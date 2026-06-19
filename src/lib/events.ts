/**
 * Click-event enqueue via Redis Streams (ARCHITECTURE.md §2.2.A/B, §8.1,
 * NFR-3). The redirect path does a fire-and-forget capped XADD and returns
 * without awaiting durable analytics. The worker consumes via a consumer group.
 */
import { getRedis } from './redis'
import { env } from './env'

export const CLICK_STREAM = 'clicks'
export const CLICK_GROUP = 'ingest'

export interface ClickEventInput {
  linkId: string
  code: string
  occurredAt: number // ms epoch
  ip: string | null
  userAgent: string | null
  referer: string | null
  vidCookie: string | null // analytics cookie id (cookie-first unique, A-UNIQUE)
}

/**
 * Fire-and-forget enqueue. Returns the stream entry id on success or null on
 * any failure — the redirect must never block or error on analytics (§8.1).
 * Uses a capped stream (MAXLEN ~) so a worker outage can't grow Redis unbounded.
 */
export async function enqueueClick(ev: ClickEventInput): Promise<string | null> {
  try {
    const redis = getRedis()
    const id = await redis.xadd(
      CLICK_STREAM,
      'MAXLEN',
      '~',
      String(env.clickStreamMaxLen),
      '*',
      'linkId',
      ev.linkId,
      'code',
      ev.code,
      'occurredAt',
      String(ev.occurredAt),
      'ip',
      ev.ip ?? '',
      'ua',
      ev.userAgent ?? '',
      'ref',
      ev.referer ?? '',
      'vid',
      ev.vidCookie ?? '',
    )
    return id
  } catch {
    return null
  }
}

/**
 * Ensure the consumer group exists (idempotent). Called by the worker.
 *
 * Created at id `0` (not `$`) so events that were XADD'd BEFORE the worker
 * started are still delivered (at-least-once, NFR-3) — without this a worker
 * restart after a burst of redirects would orphan the backlog. Reprocessing on
 * restart is safe: ingestion is idempotent on the unique `streamId`, and the
 * stream is MAXLEN-capped so the backlog is bounded.
 */
export async function ensureClickGroup(): Promise<void> {
  const redis = getRedis()
  try {
    await redis.xgroup('CREATE', CLICK_STREAM, CLICK_GROUP, '0', 'MKSTREAM')
  } catch (err) {
    const msg = (err as Error).message || ''
    if (!msg.includes('BUSYGROUP')) throw err
  }
}
