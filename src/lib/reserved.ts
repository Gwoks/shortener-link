/**
 * Reserved-word list — single source for both Next route definitions and alias
 * validation (ARCHITECTURE.md §3.1, FR-3, AC-5). Kept in code so routing and
 * validation can never drift. Comparison is case-insensitive.
 */
export const RESERVED_WORDS: readonly string[] = [
  'api',
  'login',
  'signin',
  'signup',
  'logout',
  'app',
  'dashboard',
  'admin',
  'settings',
  'account',
  'analytics',
  'links',
  'bulk',
  'qr',
  'auth',
  'healthz',
  'health',
  'dead-link',
  'gate',
  '_next',
  'static',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
] as const

const RESERVED_SET = new Set(RESERVED_WORDS.map((w) => w.toLowerCase()))

/** True if `value` collides with a reserved app route (case-insensitive). */
export function isReserved(value: string): boolean {
  return RESERVED_SET.has(value.trim().toLowerCase())
}
