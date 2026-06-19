/**
 * Frontend mirror of src/lib/validation/url.ts (ARCHITECTURE §6, FR-5, AC-7).
 * Kept UI-local so client code never imports server-only modules. Accepts only
 * well-formed http/https URLs with a real host; rejects javascript:/data:/etc.
 * The server remains the source of truth — this is for fast inline feedback.
 */
export function isValidHttpUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (!url.hostname || url.hostname.length === 0) return false
  // Require a dotted host or localhost-style host (a bare token is not valid).
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return false
  return true
}
