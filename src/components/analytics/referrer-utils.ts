/**
 * Referrer-category presentation (AC-11). The backend stores an explicit category
 * key ("social", "direct", "search", "referral", "other", …) plus an optional
 * host. We only map the key to a friendly label here — we never re-categorize, so
 * the UI reflects exactly what the API provides.
 */
const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social',
  direct: 'Direct',
  search: 'Search',
  referral: 'Referral',
  email: 'Email',
  internal: 'Internal',
  other: 'Other',
  unknown: 'Unknown',
}

export function referrerCategoryLabel(category: string): string {
  const key = category?.toLowerCase?.() ?? ''
  return CATEGORY_LABELS[key] ?? capitalize(category || 'Other')
}

/** Human label for a referrer row: "Social · facebook.com" or just "Direct". */
export function referrerRowLabel(category: string, host: string | null): string {
  const label = referrerCategoryLabel(category)
  return host ? `${label} · ${host}` : label
}

/** Short label for charts (host preferred, falls back to category). */
export function referrerShortLabel(category: string, host: string | null): string {
  return host ?? referrerCategoryLabel(category)
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Friendly geo label: "United States · San Francisco" → "country · city". */
export function geoRowLabel(country: string, city: string | null): string {
  const c = country || 'Unknown'
  return city ? `${c} · ${city}` : c
}

/** Title-case a device/browser bucket coming from the API (e.g. "mobile"). */
export function titleizeBucket(value: string): string {
  if (!value) return 'Unknown'
  return value
    .split(/[\s_-]+/)
    .map((p) => (p.length <= 2 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

/** Percentage helper for text summaries, e.g. "63%". */
export function percent(value: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
