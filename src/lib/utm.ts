/**
 * UTM assembly + preview (ARCHITECTURE.md, FR-22/23, AC-30). Pure: appends/over-
 * writes utm_* params on a destination URL, preserving existing query params and
 * fragment. Empty values are dropped.
 */
export interface UtmParams {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

const UTM_KEYS: Array<[keyof UtmParams, string]> = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['term', 'utm_term'],
  ['content', 'utm_content'],
]

/**
 * Assemble the tagged URL. Returns the input unchanged if it cannot be parsed
 * as a URL (validation of the base URL happens elsewhere via Zod).
 */
export function assembleUtmUrl(destination: string, utm?: UtmParams | null): string {
  if (!utm) return destination
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return destination
  }
  for (const [key, param] of UTM_KEYS) {
    const value = utm[key]?.trim()
    if (value) url.searchParams.set(param, value)
  }
  return url.toString()
}

/** True if any utm field is non-empty. */
export function hasUtm(utm?: UtmParams | null): boolean {
  if (!utm) return false
  return UTM_KEYS.some(([key]) => !!utm[key]?.trim())
}
