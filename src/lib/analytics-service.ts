/**
 * Analytics aggregation (ARCHITECTURE.md §6.2, §8.2, FR-7/8, AC-10/11/13/16).
 * Reads pre-aggregated ClickRollup rows (never scans raw events) and shapes the
 * per-link and aggregate responses. `insufficientData` drives the empty state
 * (FR-11/AC-16). The JSON breakdown maps are summed across the range.
 */
import { prisma } from './db'

export type Range = '7d' | '30d' | '90d' | 'all'

export function rangeStart(range: Range, now: number): Date | null {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null
  if (days === null) return null
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

type CountMap = Record<string, number>

function mergeInto(target: CountMap, src: unknown): void {
  if (!src || typeof src !== 'object') return
  for (const [k, v] of Object.entries(src as CountMap)) {
    if (typeof v === 'number') target[k] = (target[k] ?? 0) + v
  }
}

function topEntries(map: CountMap, limit = 50): Array<{ key: string; clicks: number }> {
  return Object.entries(map)
    .map(([key, clicks]) => ({ key, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit)
}

export interface LinkAnalytics {
  totals: { clicks: number; uniques: number }
  series: Array<{ day: string; clicks: number; uniques: number }>
  referrers: Array<{ category: string; host: string | null; clicks: number }>
  geo: Array<{ country: string; city: string | null; clicks: number }>
  devices: Array<{ type: string; clicks: number }>
  browsers: Array<{ name: string; clicks: number }>
  insufficientData: boolean
}

/** Per-link analytics from rollups. Caller has already authorized ownership. */
export async function getLinkAnalytics(linkId: string, range: Range, now: number): Promise<LinkAnalytics> {
  const start = rangeStart(range, now)
  const rollups = await prisma.clickRollup.findMany({
    where: { linkId, ...(start ? { day: { gte: start } } : {}) },
    orderBy: { day: 'asc' },
  })

  let clicks = 0
  let uniques = 0
  const byReferrer: CountMap = {}
  const byCountry: CountMap = {}
  const byDevice: CountMap = {}
  const byBrowser: CountMap = {}
  const series: LinkAnalytics['series'] = []

  for (const r of rollups) {
    clicks += r.clicks
    uniques += r.uniques
    series.push({ day: r.day.toISOString().slice(0, 10), clicks: r.clicks, uniques: r.uniques })
    mergeInto(byReferrer, r.byReferrer)
    mergeInto(byCountry, r.byCountry)
    mergeInto(byDevice, r.byDevice)
    mergeInto(byBrowser, r.byBrowser)
  }

  // Referrer keys are stored as "CATEGORY|host" (host may be empty).
  const referrers = topEntries(byReferrer).map(({ key, clicks }) => {
    const [category, host] = key.split('|')
    return { category, host: host || null, clicks }
  })
  // Geo keys stored as "country|city".
  const geo = topEntries(byCountry).map(({ key, clicks }) => {
    const [country, city] = key.split('|')
    return { country, city: city || null, clicks }
  })
  const devices = topEntries(byDevice).map(({ key, clicks }) => ({ type: key, clicks }))
  const browsers = topEntries(byBrowser).map(({ key, clicks }) => ({ name: key, clicks }))

  return {
    totals: { clicks, uniques },
    series,
    referrers,
    geo,
    devices,
    browsers,
    insufficientData: clicks === 0,
  }
}

export interface SummaryAnalytics {
  totals: { clicks: number; uniques: number }
  series: Array<{ day: string; clicks: number; uniques: number }>
  topLinks: Array<{ linkId: string; code: string; clicks: number }>
  referrers: Array<{ category: string; host: string | null; clicks: number }>
  geo: Array<{ country: string; city: string | null; clicks: number }>
  devices: Array<{ type: string; clicks: number }>
  browsers: Array<{ name: string; clicks: number }>
  insufficientData: boolean
}

/** Aggregate analytics across all of a user's links (AC-13). */
export async function getSummaryAnalytics(userId: string, range: Range, now: number): Promise<SummaryAnalytics> {
  const start = rangeStart(range, now)
  const links = await prisma.link.findMany({ where: { ownerId: userId }, select: { id: true, code: true, aliasDisplay: true } })
  const linkIds = links.map((l) => l.id)
  if (linkIds.length === 0) {
    return { totals: { clicks: 0, uniques: 0 }, series: [], topLinks: [], referrers: [], geo: [], devices: [], browsers: [], insufficientData: true }
  }

  const rollups = await prisma.clickRollup.findMany({
    where: { linkId: { in: linkIds }, ...(start ? { day: { gte: start } } : {}) },
  })

  let clicks = 0
  let uniques = 0
  const perDay = new Map<string, { clicks: number; uniques: number }>()
  const perLink = new Map<string, number>()
  const byReferrer: CountMap = {}
  const byCountry: CountMap = {}
  const byDevice: CountMap = {}
  const byBrowser: CountMap = {}

  for (const r of rollups) {
    clicks += r.clicks
    uniques += r.uniques
    const day = r.day.toISOString().slice(0, 10)
    const d = perDay.get(day) ?? { clicks: 0, uniques: 0 }
    d.clicks += r.clicks
    d.uniques += r.uniques
    perDay.set(day, d)
    perLink.set(r.linkId, (perLink.get(r.linkId) ?? 0) + r.clicks)
    mergeInto(byReferrer, r.byReferrer)
    mergeInto(byCountry, r.byCountry)
    mergeInto(byDevice, r.byDevice)
    mergeInto(byBrowser, r.byBrowser)
  }

  const series = [...perDay.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const codeById = new Map(links.map((l) => [l.id, l.aliasDisplay ?? l.code]))
  const topLinks = [...perLink.entries()]
    .map(([linkId, c]) => ({ linkId, code: codeById.get(linkId) ?? linkId, clicks: c }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10)

  // Aggregate breakdowns across all links (same shape/derivation as per-link).
  const referrers = topEntries(byReferrer).map(({ key, clicks }) => {
    const [category, host] = key.split('|')
    return { category, host: host || null, clicks }
  })
  const geo = topEntries(byCountry).map(({ key, clicks }) => {
    const [country, city] = key.split('|')
    return { country, city: city || null, clicks }
  })
  const devices = topEntries(byDevice).map(({ key, clicks }) => ({ type: key, clicks }))
  const browsers = topEntries(byBrowser).map(({ key, clicks }) => ({ name: key, clicks }))

  return { totals: { clicks, uniques }, series, topLinks, referrers, geo, devices, browsers, insufficientData: clicks === 0 }
}
