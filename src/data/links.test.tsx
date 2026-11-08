import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, isNotFound } from '@/components/lib/api'
import type { LinkResource } from '@/components/lib/types'
import { createQueryClient } from './query-client'
import { queryKeys } from './query-keys'
import { useDeleteLink, useLink, useLinks } from './links'

function wrapper() {
  const client = createQueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, Wrapper }
}

const LINK = { id: 'l1', code: 'abc', shortUrl: 'http://s/abc' } as LinkResource

afterEach(() => vi.restoreAllMocks())

describe('useLink', () => {
  it('unwraps the link from the response', async () => {
    vi.spyOn(api, 'getLink').mockResolvedValue({ link: LINK })
    const { Wrapper } = wrapper()

    const { result } = renderHook(() => useLink('l1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(LINK)
  })

  it('surfaces FORBIDDEN as a not-found error without retrying', async () => {
    const getLink = vi
      .spyOn(api, 'getLink')
      .mockRejectedValue(new ApiError('FORBIDDEN', 'Nope', 403))
    const { Wrapper } = wrapper()

    const { result } = renderHook(() => useLink('l1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(isNotFound(result.current.error)).toBe(true)
    expect(getLink).toHaveBeenCalledTimes(1)
  })

  it('does not fetch without an id', () => {
    const getLink = vi.spyOn(api, 'getLink')
    const { Wrapper } = wrapper()

    renderHook(() => useLink(''), { wrapper: Wrapper })

    expect(getLink).not.toHaveBeenCalled()
  })
})

describe('useLinks', () => {
  it('requests the page described by the params', async () => {
    const listLinks = vi
      .spyOn(api, 'listLinks')
      .mockResolvedValue({ items: [LINK], total: 1, page: 2, pageSize: 20 })
    const { Wrapper } = wrapper()

    const { result } = renderHook(() => useLinks({ page: 2, pageSize: 20 }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listLinks).toHaveBeenCalledWith({ page: 2, pageSize: 20 })
    expect(result.current.data?.total).toBe(1)
  })
})

describe('useDeleteLink', () => {
  it('invalidates every link and analytics query after a delete', async () => {
    vi.spyOn(api, 'deleteLink').mockResolvedValue(undefined)
    const { client, Wrapper } = wrapper()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteLink(), { wrapper: Wrapper })
    await result.current.mutateAsync('l1')

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.links.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.analytics.all })
  })
})
