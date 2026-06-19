/**
 * Typed client for the app API (ARCHITECTURE.md §6). Centralizes fetch + the
 * error envelope (§6.3) so every surface gets consistent, recovery-oriented
 * messaging (FR-37). All calls are same-origin; mutations rely on Auth.js CSRF
 * via cookies (credentials: 'same-origin').
 */
import type {
  AliasCheckResponse,
  AnalyticsRange,
  ApiErrorBody,
  BulkResponse,
  CreateLinkPayload,
  ErrorCode,
  LinkAnalytics,
  LinkListResponse,
  LinkResource,
  PatchLinkPayload,
  SummaryAnalytics,
} from './types'

/** Error thrown by the client, carrying the machine code + recovery hints. */
export class ApiError extends Error {
  code: ErrorCode
  status: number
  field?: string
  suggestions?: string[]
  retryAfter?: number

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    extra?: { field?: string; suggestions?: string[]; retryAfter?: number },
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.field = extra?.field
    this.suggestions = extra?.suggestions
    this.retryAfter = extra?.retryAfter
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('INTERNAL', 'Network error. Check your connection and try again.', 0)
  }

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    let body: ApiErrorBody | null = null
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      /* non-JSON error */
    }
    const retryHeader = res.headers.get('Retry-After')
    const err = body?.error
    throw new ApiError(
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Something went wrong. Please try again.',
      res.status,
      {
        field: err?.field,
        suggestions: err?.suggestions,
        retryAfter: retryHeader ? Number(retryHeader) : undefined,
      },
    )
  }

  const ct = res.headers.get('Content-Type') ?? ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return undefined as T
}

export const api = {
  // ── Links ──
  createLink(payload: CreateLinkPayload): Promise<{ link: LinkResource }> {
    return request('/api/links', { method: 'POST', body: JSON.stringify(payload) })
  },
  listLinks(params: {
    q?: string
    status?: string
    sort?: string
    order?: string
    page?: number
    pageSize?: number
  }): Promise<LinkListResponse> {
    const sp = new URLSearchParams()
    if (params.q) sp.set('q', params.q)
    if (params.status) sp.set('status', params.status)
    if (params.sort) sp.set('sort', params.sort)
    if (params.order) sp.set('order', params.order)
    if (params.page) sp.set('page', String(params.page))
    if (params.pageSize) sp.set('pageSize', String(params.pageSize))
    const qs = sp.toString()
    return request(`/api/links${qs ? `?${qs}` : ''}`)
  },
  getLink(id: string): Promise<{ link: LinkResource }> {
    return request(`/api/links/${id}`)
  },
  patchLink(id: string, payload: PatchLinkPayload): Promise<{ link: LinkResource }> {
    return request(`/api/links/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
  },
  deleteLink(id: string): Promise<void> {
    return request(`/api/links/${id}`, { method: 'DELETE' })
  },
  checkAlias(alias: string): Promise<AliasCheckResponse> {
    return request(`/api/links/check-alias?alias=${encodeURIComponent(alias)}`)
  },
  bulk(urls: string[]): Promise<BulkResponse> {
    return request('/api/links/bulk', { method: 'POST', body: JSON.stringify({ urls }) })
  },

  // ── Analytics ──
  linkAnalytics(id: string, range: AnalyticsRange): Promise<LinkAnalytics> {
    return request(`/api/links/${id}/analytics?range=${range}`)
  },
  summary(range: AnalyticsRange): Promise<SummaryAnalytics> {
    return request(`/api/analytics/summary?range=${range}`)
  },

  // ── Guest claiming ──
  claimable(): Promise<{ links: LinkResource[] }> {
    return request('/api/guest-links/claimable')
  },
  claim(ids: string[]): Promise<{ claimed: number }> {
    return request('/api/guest-links/claim', { method: 'POST', body: JSON.stringify({ ids }) })
  },

  // ── Auth ──
  register(payload: { email: string; password: string; name?: string }): Promise<unknown> {
    return request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) })
  },
}

/** QR endpoints return PNG, used directly as <img src>. */
export function qrUrlForCode(code: string, size: 'sm' | 'md' | 'lg', download = false): string {
  return `/api/qr/${encodeURIComponent(code)}?size=${size}${download ? '&download=1' : ''}`
}
export function qrUrlForId(id: string, size: 'sm' | 'md' | 'lg', download = false): string {
  return `/api/links/${id}/qr?size=${size}${download ? '&download=1' : ''}`
}
