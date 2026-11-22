import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/components/lib/api'
import type { LinkAnalytics, SummaryAnalytics } from '@/components/lib/types'
import { useLinkAnalytics, useSummaryAnalytics } from './analytics'
import { createQueryClient } from './query-client'

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
}

afterEach(() => vi.restoreAllMocks())

describe('useSummaryAnalytics', () => {
  it('combines the summary with total and active link counts', async () => {
    const summary = { totals: { clicks: 5, uniques: 3 } } as SummaryAnalytics
    vi.spyOn(api, 'summary').mockResolvedValue(summary)
    vi.spyOn(api, 'listLinks').mockImplementation(async (params) => ({
      items: [],
      total: params.status === 'active' ? 4 : 9,
      page: 1,
      pageSize: 1,
    }))

    const { result } = renderHook(() => useSummaryAnalytics('7d'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ summary, totalLinks: 9, activeLinks: 4 })
  })
})

describe('useLinkAnalytics', () => {
  it('waits until enabled before fetching', async () => {
    const fetch = vi.spyOn(api, 'linkAnalytics').mockResolvedValue({} as LinkAnalytics)

    const { rerender } = renderHook(({ enabled }) => useLinkAnalytics('l1', '30d', enabled), {
      wrapper: Wrapper,
      initialProps: { enabled: false },
    })
    expect(fetch).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('l1', '30d'))
  })
})
