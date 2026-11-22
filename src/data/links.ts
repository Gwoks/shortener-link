/**
 * Link server-state hooks. Pages read links only through these, so request
 * races, previous-page placeholders, and post-mutation refreshes are handled
 * once (replacing the per-page reqId / loadedOnce / manual refetch code).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '@/components/lib/api'
import { queryKeys, type LinkListParams } from './query-keys'

/** One link by id. NOT_FOUND / FORBIDDEN surface as the query error. */
export function useLink(id: string) {
  return useQuery({
    queryKey: queryKeys.links.detail(id),
    queryFn: async () => (await api.getLink(id)).link,
    enabled: id !== '',
  })
}

/** A page of links; keeps the previous page on screen while the next loads. */
export function useLinks(params: LinkListParams) {
  return useQuery({
    queryKey: queryKeys.links.list(params),
    queryFn: () => api.listLinks(params),
    placeholderData: keepPreviousData,
  })
}

/** Refresh every cached link list / detail and analytics after a write. */
export function useInvalidateLinks(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ])
  }, [queryClient])
}

export function useDeleteLink() {
  const invalidateLinks = useInvalidateLinks()
  return useMutation({
    mutationFn: (id: string) => api.deleteLink(id),
    onSuccess: invalidateLinks,
  })
}
