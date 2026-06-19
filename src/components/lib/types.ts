/**
 * Frontend mirror of the backend API contract (ARCHITECTURE.md §6). These shapes
 * match `serializeLink` (src/lib/serialize.ts) and the analytics service exactly.
 * Kept frontend-local so UI code never imports server-only modules.
 */

export type LinkStatus = 'ACTIVE' | 'EXPIRED' | 'DEACTIVATED'
export type MetaStatus = 'PENDING' | 'READY' | 'FAILED'

/** Matches `LinkResource` in src/lib/serialize.ts. */
export interface LinkResource {
  id: string
  code: string
  shortUrl: string
  destinationUrl: string
  status: LinkStatus
  metaStatus: MetaStatus
  metaTitle: string | null
  metaDescription: string | null
  hasPassword: boolean
  expiresAt: string | null
  maxClicks: number | null
  clickCount: number
  isGuest: boolean
  createdAt: string
  updatedAt: string
}

export interface LinkListResponse {
  items: LinkResource[]
  page: number
  pageSize: number
  total: number
}

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

/** Matches the error envelope in src/lib/errors.ts (§6.3). */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
    field?: string
    suggestions?: string[]
  }
}

export interface AliasCheckResponse {
  available: boolean
  reason?: 'taken' | 'reserved' | 'invalid'
  suggestions?: string[]
}

export interface BulkResultRow {
  input: string
  ok: boolean
  link?: LinkResource
  error?: { code: ErrorCode; message: string }
}

export interface BulkResponse {
  results: BulkResultRow[]
}

export interface LinkAnalytics {
  totals: { clicks: number; uniques: number }
  series: Array<{ day: string; clicks: number; uniques: number }>
  referrers: Array<{ category: string; host: string | null; clicks: number }>
  geo: Array<{ country: string; city: string | null; clicks: number }>
  devices: Array<{ type: string; clicks: number }>
  browsers: Array<{ name: string; clicks: number }>
  insufficientData: boolean
}

export interface SummaryAnalytics {
  totals: { clicks: number; uniques: number }
  series: Array<{ day: string; clicks: number; uniques: number }>
  topLinks: Array<{ linkId: string; code: string; clicks: number }>
  referrers: Array<{ category: string; host: string | null; clicks: number }>
  geo: Array<{ country: string; city: string | null; clicks: number }>
  devices: Array<{ type: string; clicks: number }>
  browsers: Array<{ name: string; clicks: number }>
  insufficientData: boolean
}

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all'

export interface UtmFields {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

export interface CreateLinkPayload {
  url: string
  alias?: string
  expiresAt?: string
  maxClicks?: number
  password?: string
  utm?: UtmFields
}

export interface PatchLinkPayload {
  destinationUrl?: string
  alias?: string
  expiresAt?: string | null
  maxClicks?: number | null
  status?: 'ACTIVE' | 'DEACTIVATED'
  password?: string | null
}
