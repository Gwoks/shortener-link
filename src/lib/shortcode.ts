/**
 * Base62 short-code generation (ARCHITECTURE.md §0 A-COL, FR-1).
 * Length 6 by default, random-and-check with retry-on-collision; auto-grows to
 * 7 at saturation. The collision check is injected so this module is pure and
 * unit-testable without a database.
 */
import { randomInt } from 'node:crypto'

export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const DEFAULT_CODE_LENGTH = 6
export const GROWN_CODE_LENGTH = 7

/** Generate a single random Base62 string of the given length. */
export function randomCode(length: number = DEFAULT_CODE_LENGTH): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += BASE62[randomInt(BASE62.length)]
  }
  return out
}

/** Validate that a string is a well-formed generated code (Base62, given len). */
export function isValidGeneratedCode(code: string, length: number = DEFAULT_CODE_LENGTH): boolean {
  if (code.length !== length) return false
  for (const ch of code) if (!BASE62.includes(ch)) return false
  return true
}

export interface GenerateOptions {
  /** Returns true if the candidate is already taken (case-insensitive lookup). */
  exists: (candidate: string) => Promise<boolean> | boolean
  /** Max attempts at the base length before growing the code (default 8). */
  maxAttemptsPerLength?: number
  /** Override randomness for deterministic tests. */
  rng?: (length: number) => string
}

/**
 * Generate a unique short code by repeatedly trying random codes until one is
 * free. Grows the length once the base length saturates. Throws only if even
 * the grown length cannot find a free code within the attempt budget (which is
 * effectively impossible at any realistic scale, but is surfaced rather than
 * looping forever).
 */
export async function generateUniqueCode(opts: GenerateOptions): Promise<string> {
  const maxAttempts = opts.maxAttemptsPerLength ?? 8
  const rng = opts.rng ?? randomCode

  for (const length of [DEFAULT_CODE_LENGTH, GROWN_CODE_LENGTH]) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = rng(length)
      // Codes are matched case-insensitively (stored lowercased), so check the
      // lowercased form for collisions.
      const taken = await opts.exists(candidate.toLowerCase())
      if (!taken) return candidate
    }
  }
  throw new Error('Failed to generate a unique short code after exhausting attempts')
}
