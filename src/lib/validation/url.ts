/**
 * Shared URL validation (ARCHITECTURE.md §6, FR-5, AC-7). Backend-authored,
 * frontend-consumed. Accepts only well-formed http/https URLs with a real host;
 * explicitly rejects javascript:, data:, and other dangerous schemes.
 */
import { z } from 'zod'

export function isValidHttpUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (!url.hostname || url.hostname.length === 0) return false
  // Require a dotted host or localhost-style host (a bare token like "foo" is
  // not a valid public destination).
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return false
  return true
}

export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, 'A destination URL is required.')
  .max(2048, 'That URL is too long.')
  .refine(isValidHttpUrl, {
    message: "That doesn't look like a valid web address. Use a full http(s):// URL.",
  })
