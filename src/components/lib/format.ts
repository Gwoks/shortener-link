/**
 * Presentation helpers — relative time, status derivation, number formatting.
 * Pure, used across screens. Status presentation is derived from the persisted
 * lifecycle columns per ARCHITECTURE.md §5.2.
 */
import type { LinkResource } from './types'

const SOON_MS = 24 * 60 * 60 * 1000

/** UI presentation status (DESIGN §4.4). Password is a separate adornment. */
export type PresentationStatus = 'active' | 'expiring' | 'expired' | 'deactivated' | 'pending'

export function presentationStatus(link: LinkResource, now = Date.now()): PresentationStatus {
  if (link.status === 'DEACTIVATED') return 'deactivated'
  if (link.status === 'EXPIRED') return 'expired'
  if (link.expiresAt) {
    const exp = new Date(link.expiresAt).getTime()
    if (exp <= now) return 'expired'
    if (exp - now <= SOON_MS) return 'expiring'
  }
  if (link.maxClicks != null && link.clickCount >= link.maxClicks) return 'expired'
  if (link.metaStatus === 'PENDING') return 'pending'
  return 'active'
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** Compact relative time, e.g. "2 days ago", "in 5 hours". */
export function relativeTime(iso: string | number | Date, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime()
  const diff = t - now
  const abs = Math.abs(diff)
  const sec = abs / 1000
  if (sec < 60) return rtf.format(Math.round(diff / 1000), 'second')
  const min = sec / 60
  if (min < 60) return rtf.format(Math.round(diff / 60000), 'minute')
  const hr = min / 60
  if (hr < 24) return rtf.format(Math.round(diff / 3600000), 'hour')
  const day = hr / 24
  if (day < 30) return rtf.format(Math.round(diff / 86400000), 'day')
  const month = day / 30
  if (month < 12) return rtf.format(Math.round(month), 'month')
  return rtf.format(Math.round(month / 12), 'year')
}

/** Absolute, locale-neutral timestamp for tooltips. */
export function absoluteTime(iso: string | number | Date): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const nf = new Intl.NumberFormat('en')
export function formatNumber(n: number): string {
  return nf.format(n)
}

/** Human-readable "expires in / after" helper for the create form (FR-15). */
export function expiryHint(expiresAt: string | null, maxClicks: number | null, now = Date.now()): string | null {
  const parts: string[] = []
  if (expiresAt) {
    const exp = new Date(expiresAt).getTime()
    if (exp > now) parts.push(`expires ${relativeTime(exp, now)}`)
    else parts.push('already expired')
  }
  if (maxClicks != null) parts.push(`after ${formatNumber(maxClicks)} clicks`)
  if (parts.length === 0) return null
  return parts.join(' · ')
}

/** Strip protocol for a tighter destination display while keeping the full value in title. */
export function displayDestination(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

/** Convert a datetime-local input value to an ISO string (assumes local time). */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Convert an ISO string to a datetime-local input value. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

/** Minimum datetime-local value (now), for the expiry picker min. */
export function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString())
}
