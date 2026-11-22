/**
 * Analytics server-state hooks (summary + per-link). Range switches keep the
 * previous figures visible until the new range resolves.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/components/lib/api'
import type { AnalyticsRange, SummaryAnalytics } from '@/components/lib/types'
import { queryKeys } from './query-keys'

export interface SummaryData {
  summary: SummaryAnalytics
  totalLinks: number
  activeLinks: number
}

/** Account-wide analytics plus total / active link counts for the KPI tiles. */
export function useSummaryAnalytics(range: AnalyticsRange) {
  return useQuery({
    queryKey: queryKeys.analytics.summary(range),
    queryFn: async (): Promise<SummaryData> => {
      const [summary, total, active] = await Promise.all([
        api.summary(range),
        api.listLinks({ pageSize: 1 }),
        api.listLinks({ status: 'active', pageSize: 1 }),
      ])
      return { summary, totalLinks: total.total, activeLinks: active.total }
    },
    placeholderData: keepPreviousData,
  })
}

/** Per-link breakdowns; disabled until the caller knows the link is eligible. */
export function useLinkAnalytics(id: string, range: AnalyticsRange, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.analytics.link(id, range),
    queryFn: () => api.linkAnalytics(id, range),
    enabled,
    placeholderData: keepPreviousData,
  })
}
