/**
 * Click ingestion consumer (ARCHITECTURE.md §2.2.B, §8.2, NFR-3). Reads the
 * `clicks` Redis Stream via a consumer group, enriches each event (geo, UA,
 * referrer, visitor-key), inserts the ClickEvent, upserts the daily ClickRollup
 * and Link.clickCount, then XACKs. At-least-once: idempotent on streamId
 * (unique) so reprocessing after a crash doesn't double count.
 */
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { CLICK_STREAM, CLICK_GROUP, ensureClickGroup } from '@/lib/events'
import { geoLookup } from '@/lib/geo'
import { parseUserAgent } from '@/lib/ua'
import { categorizeReferrer } from '@/lib/referrer'
import { visitorKey } from '@/lib/hash'
import { Prisma } from '@prisma/client'

const CONSUMER = `worker-${process.pid}`
const BATCH = 100
const BLOCK_MS = 2000

interface RawEvent {
  streamId: string
  linkId: string
  code: string
  occurredAt: number
  ip: string | null
  ua: string | null
  ref: string | null
  vid: string | null
}

function fieldsToObject(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {}
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1]
  return obj
}

/** Process a single click event into durable storage. Idempotent on streamId. */
export async function processEvent(ev: RawEvent): Promise<void> {
  // Skip if already ingested (idempotency, NFR-3).
  const existing = await prisma.clickEvent.findUnique({
    where: { streamId: ev.streamId },
    select: { id: true },
  })
  if (existing) return

  // Ensure the link still exists (it may have been deleted; cascade handles
  // events, but inserting against a missing FK would throw).
  const link = await prisma.link.findUnique({ where: { id: ev.linkId }, select: { id: true } })
  if (!link) return

  const occurredAt = new Date(Number.isFinite(ev.occurredAt) ? ev.occurredAt : Date.now())
  const ua = parseUserAgent(ev.ua)
  const ref = categorizeReferrer(ev.ref)
  const geo = await geoLookup(ev.ip)
  const vkey = visitorKey({
    cookieId: ev.vid,
    ip: ev.ip,
    userAgent: ev.ua,
    now: occurredAt.getTime(),
  })

  // Unique-visitor detection: first time (linkId, visitorKey) is seen → unique.
  let isUnique = false
  try {
    await prisma.visitorSeen.create({ data: { linkId: ev.linkId, visitorKey: vkey } })
    isUnique = true
  } catch {
    isUnique = false // already seen (PK conflict)
  }

  const day = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()))

  // Breakdown keys.
  const refKey = `${ref.category}|${ref.host ?? ''}`
  const geoKey = `${geo.country ?? 'Unknown'}|${geo.city ?? ''}`
  const deviceKey = ua.deviceType
  const browserKey = ua.browser ?? 'Unknown'

  await prisma.$transaction(async (tx) => {
    await tx.clickEvent.create({
      data: {
        linkId: ev.linkId,
        occurredAt,
        visitorKey: vkey,
        isUnique,
        referrerCategory: ref.category,
        referrerHost: ref.host,
        country: geo.country,
        city: geo.city,
        deviceType: ua.deviceType,
        browser: ua.browser,
        streamId: ev.streamId,
      },
    })

    await tx.link.update({ where: { id: ev.linkId }, data: { clickCount: { increment: 1 } } })

    // Upsert daily rollup with incremented counts + merged breakdown maps.
    const existingRollup = await tx.clickRollup.findUnique({
      where: { linkId_day: { linkId: ev.linkId, day } },
    })
    if (!existingRollup) {
      await tx.clickRollup.create({
        data: {
          linkId: ev.linkId,
          day,
          clicks: 1,
          uniques: isUnique ? 1 : 0,
          byReferrer: { [refKey]: 1 },
          byCountry: { [geoKey]: 1 },
          byDevice: { [deviceKey]: 1 },
          byBrowser: { [browserKey]: 1 },
        },
      })
    } else {
      await tx.clickRollup.update({
        where: { linkId_day: { linkId: ev.linkId, day } },
        data: {
          clicks: { increment: 1 },
          uniques: { increment: isUnique ? 1 : 0 },
          byReferrer: bumpMap(existingRollup.byReferrer, refKey),
          byCountry: bumpMap(existingRollup.byCountry, geoKey),
          byDevice: bumpMap(existingRollup.byDevice, deviceKey),
          byBrowser: bumpMap(existingRollup.byBrowser, browserKey),
        },
      })
    }
  })
}

function bumpMap(current: Prisma.JsonValue, key: string): Prisma.InputJsonValue {
  const map = (current && typeof current === 'object' ? { ...(current as Record<string, number>) } : {}) as Record<
    string,
    number
  >
  map[key] = (map[key] ?? 0) + 1
  return map
}

/** Run the consumer loop until `signal` aborts. */
export async function runClickConsumer(signal: AbortSignal): Promise<void> {
  await ensureClickGroup()
  const redis = getRedis()
  console.log(`[worker] click consumer ${CONSUMER} started`)

  while (!signal.aborted) {
    let response: Array<[string, Array<[string, string[]]>]> | null = null
    try {
      response = (await redis.xreadgroup(
        'GROUP',
        CLICK_GROUP,
        CONSUMER,
        'COUNT',
        BATCH,
        'BLOCK',
        BLOCK_MS,
        'STREAMS',
        CLICK_STREAM,
        '>',
      )) as Array<[string, Array<[string, string[]]>]> | null
    } catch (err) {
      if (signal.aborted) break
      console.error('[worker] xreadgroup error:', (err as Error).message)
      await sleep(1000)
      continue
    }

    if (!response) continue

    for (const [, entries] of response) {
      for (const [id, fields] of entries) {
        const obj = fieldsToObject(fields)
        try {
          await processEvent({
            streamId: id,
            linkId: obj.linkId,
            code: obj.code,
            occurredAt: Number.parseInt(obj.occurredAt, 10),
            ip: obj.ip || null,
            ua: obj.ua || null,
            ref: obj.ref || null,
            vid: obj.vid || null,
          })
          await redis.xack(CLICK_STREAM, CLICK_GROUP, id)
        } catch (err) {
          // Leave unacked for redelivery; log and continue.
          console.error(`[worker] failed to process click ${id}:`, (err as Error).message)
        }
      }
    }
  }
  console.log('[worker] click consumer stopped')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
