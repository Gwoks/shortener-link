/**
 * TanStack Query client — the single server-state cache for the SPA. Every
 * fetch goes through `src/data/*` hooks so loading / error / refetch handling
 * is defined once instead of per page.
 */
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/components/lib/api'

const MAX_RETRIES = 2
const STALE_TIME_MS = 30_000

/** Retry only transient failures (network / 5xx); 4xx answers are final. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (!(error instanceof ApiError)) return true
  return error.status === 0 || error.status >= 500
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: STALE_TIME_MS,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
