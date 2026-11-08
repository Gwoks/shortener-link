/**
 * Query-key factory — one place that defines cache identity, so mutations can
 * invalidate whole families (e.g. every `links` query) without string drift.
 */
import type { AnalyticsRange } from '@/components/lib/types'

export interface LinkListParams {
  q?: string
  status?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export const queryKeys = {
  links: {
    all: ['links'] as const,
    list: (params: LinkListParams) => ['links', 'list', params] as const,
    detail: (id: string) => ['links', 'detail', id] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    summary: (range: AnalyticsRange) => ['analytics', 'summary', range] as const,
    link: (id: string, range: AnalyticsRange) => ['analytics', 'link', id, range] as const,
  },
  guest: {
    claimable: ['guest', 'claimable'] as const,
  },
}
