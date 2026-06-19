/**
 * Referrer categorization (ARCHITECTURE.md §5.1, FR-7, AC-11). Pure.
 * No Referer header => DIRECT; known social/search hosts => SOCIAL/SEARCH;
 * any other host => REFERRAL; unparseable => OTHER.
 */
export type RefCategory = 'SOCIAL' | 'SEARCH' | 'DIRECT' | 'REFERRAL' | 'OTHER'

const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.com',
  'fb.me',
  'instagram.com',
  'twitter.com',
  'x.com',
  't.co',
  'linkedin.com',
  'lnkd.in',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  'whatsapp.com',
  'telegram.org',
  't.me',
  'threads.net',
  'mastodon.social',
  'snapchat.com',
]

const SEARCH_HOSTS = [
  'google.com',
  'google.',
  'bing.com',
  'duckduckgo.com',
  'yahoo.com',
  'search.yahoo.com',
  'yandex.com',
  'yandex.ru',
  'baidu.com',
  'ecosia.org',
  'brave.com',
  'startpage.com',
]

/** Strip a leading `www.` and lowercase. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function matchesAny(host: string, list: string[]): boolean {
  return list.some((entry) =>
    entry.endsWith('.') ? host.startsWith(entry) || host.includes('.' + entry) : host === entry || host.endsWith('.' + entry),
  )
}

export interface ReferrerResult {
  category: RefCategory
  host: string | null
}

/**
 * Categorize a raw Referer header value (may be null/empty/garbage).
 */
export function categorizeReferrer(referer: string | null | undefined): ReferrerResult {
  if (!referer || referer.trim() === '') return { category: 'DIRECT', host: null }
  let host: string
  try {
    host = normalizeHost(new URL(referer).hostname)
  } catch {
    return { category: 'OTHER', host: null }
  }
  if (!host) return { category: 'DIRECT', host: null }
  if (matchesAny(host, SOCIAL_HOSTS)) return { category: 'SOCIAL', host }
  if (matchesAny(host, SEARCH_HOSTS)) return { category: 'SEARCH', host }
  return { category: 'REFERRAL', host }
}
