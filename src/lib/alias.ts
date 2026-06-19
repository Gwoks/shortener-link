/**
 * Custom-alias validation and suggestions (ARCHITECTURE.md §3.1, FR-2/3/44,
 * A-ALIAS). Allowed charset [A-Za-z0-9_-], length 3–50, case-insensitive,
 * global namespace, reserved words rejected. Pure & unit-testable.
 */
import { isReserved } from './reserved'
import { BASE62 } from './shortcode'

export const ALIAS_MIN = 3
export const ALIAS_MAX = 50
export const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/

export type AliasReason = 'taken' | 'reserved' | 'invalid'

export interface AliasValidation {
  ok: boolean
  reason?: AliasReason
  message?: string
}

/**
 * Syntactic + reserved validation (no DB). Returns `ok:false` with a reason for
 * empty/charset/length violations and reserved words. Availability (taken) is a
 * separate DB check performed by the caller.
 */
export function validateAliasSyntax(raw: string): AliasValidation {
  const alias = raw.trim()
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) {
    return {
      ok: false,
      reason: 'invalid',
      message: `Custom links must be ${ALIAS_MIN}–${ALIAS_MAX} characters.`,
    }
  }
  if (!ALIAS_PATTERN.test(alias)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Use only letters, numbers, hyphens, and underscores.',
    }
  }
  if (isReserved(alias)) {
    return {
      ok: false,
      reason: 'reserved',
      message: 'That word is reserved by the app and cannot be used as a custom link.',
    }
  }
  return { ok: true }
}

/** Normalize an alias to its stored (lowercased) form for uniqueness matching. */
export function normalizeAlias(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Generate alternative suggestions for a taken alias (FR-44, AC-4). Appends
 * short numeric/word suffixes within the length bound. `rng` is injectable for
 * deterministic tests.
 */
export function suggestAliases(
  base: string,
  rng: () => string = () => BASE62[Math.floor(Math.random() * BASE62.length)],
): string[] {
  const root = normalizeAlias(base).replace(/[^a-z0-9_-]/g, '') || 'link'
  const trimmedRoot = root.slice(0, ALIAS_MAX - 4)
  const candidates = new Set<string>()
  const suffixes = ['-2', '-go', `-${rng()}${rng()}`, '-new', `-${new Date().getUTCFullYear()}`]
  for (const sfx of suffixes) {
    const candidate = (trimmedRoot + sfx).slice(0, ALIAS_MAX)
    if (candidate.length >= ALIAS_MIN && !isReserved(candidate)) candidates.add(candidate)
    if (candidates.size >= 3) break
  }
  return [...candidates]
}
