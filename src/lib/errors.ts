/**
 * Uniform API error envelope (ARCHITECTURE.md §4.7, §6.3). Every /api/* non-2xx
 * returns `{ error: { code, message, field?, suggestions? } }` with a stable
 * machine `code` and a human, recovery-oriented `message` (FR-37, AC-43/44).
 */
import { NextResponse } from 'next/server'

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_URL'
  | 'ALIAS_TAKEN'
  | 'ALIAS_RESERVED'
  | 'URL_BLOCKED'
  | 'RATE_LIMITED'
  | 'UNLOCK_LOCKED'
  | 'WRONG_PASSWORD'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BULK_LIMIT_EXCEEDED'
  | 'EMAIL_TAKEN'
  | 'INTERNAL'

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  INVALID_URL: 422,
  ALIAS_TAKEN: 409,
  ALIAS_RESERVED: 422,
  URL_BLOCKED: 400,
  RATE_LIMITED: 429,
  UNLOCK_LOCKED: 429,
  WRONG_PASSWORD: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BULK_LIMIT_EXCEEDED: 413,
  EMAIL_TAKEN: 409,
  INTERNAL: 500,
}

/** Default friendly copy with a recovery path; callers can override `message`. */
export const ERROR_DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Some of the details need fixing. Check the highlighted fields and try again.',
  INVALID_URL: "That doesn't look like a valid web address. Use a full http(s):// URL.",
  ALIAS_TAKEN: 'That custom link is already in use. Try another or pick a suggestion.',
  ALIAS_RESERVED: 'That word is reserved by the app. Pick a different custom link.',
  URL_BLOCKED:
    "We couldn't shorten that link because the destination is on a safety blocklist. Double-check the address or try a different one.",
  RATE_LIMITED: "You're going a bit fast. Wait a moment and try again.",
  UNLOCK_LOCKED: 'Too many incorrect attempts. Please wait a bit before trying again.',
  WRONG_PASSWORD: "That password isn't right. Try again.",
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have access to this resource.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  BULK_LIMIT_EXCEEDED: 'That batch is too large. Reduce the number of URLs and try again.',
  EMAIL_TAKEN: 'An account with that email already exists. Try signing in instead.',
  INTERNAL: 'Something went wrong on our end. Please try again.',
}

export interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    field?: string
    suggestions?: string[]
  }
}

export interface ApiErrorOptions {
  message?: string
  field?: string
  suggestions?: string[]
  /** Extra headers, e.g. Retry-After for 429. */
  headers?: Record<string, string>
}

/** Build a NextResponse carrying the standard error envelope. */
export function apiError(code: ErrorCode, opts: ApiErrorOptions = {}): NextResponse<ErrorBody> {
  const body: ErrorBody = {
    error: {
      code,
      message: opts.message ?? ERROR_DEFAULT_MESSAGE[code],
      ...(opts.field ? { field: opts.field } : {}),
      ...(opts.suggestions ? { suggestions: opts.suggestions } : {}),
    },
  }
  return NextResponse.json(body, { status: ERROR_STATUS[code], headers: opts.headers })
}

/** Thrown internally and converted to an envelope by route wrappers. */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public options: ApiErrorOptions = {},
  ) {
    super(options.message ?? ERROR_DEFAULT_MESSAGE[code])
    this.name = 'ApiError'
  }

  toResponse(): NextResponse<ErrorBody> {
    return apiError(this.code, this.options)
  }
}
