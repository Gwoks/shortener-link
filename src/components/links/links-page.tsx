'use client'

/**
 * Links list page controller (DESIGN §5.4, USER-JOURNEY §4.5, FR-28/29/30/31).
 * Owns query state (synced to the URL so it survives reload + back/forward),
 * fetches via the typed api client, and drives the loading / error / empty /
 * filtered-empty / data states. Renders the toolbar, the desktop table + mobile
 * cards, pagination, and the shared delete-confirm dialog.
 */
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '../app/app-shell'
import { api, ApiError } from '../lib/api'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import { DeleteLinkDialog } from './delete-link-dialog'
import { LinkCard } from './link-card'
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  hasActiveFilters,
  paramsFromQuery,
  queryFromParams,
  type LinksQuery,
  type SortKey,
} from './links-query'
import { LinksPagination } from './links-pagination'
import {
  LinksEmptyState,
  LinksError,
  LinksFilteredEmpty,
  LinksLoading,
} from './links-states'
import { LinksTable } from './links-table'
import { LinksToolbar } from './links-toolbar'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: LinkResource[]; total: number }

export function LinksPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Seed query state from the URL once; thereafter we drive the URL from state.
  const initialQuery = useMemo(
    () => queryFromParams(new URLSearchParams(searchParams.toString())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [query, setQuery] = useState<LinksQuery>(initialQuery)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<LinkResource | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Monotonic request token so a slow response can't overwrite a newer one.
  const reqId = useRef(0)
  // Distinguish first load (full skeleton) from subsequent refetches (keep data).
  const loadedOnce = useRef(false)

  const load = useCallback(async (q: LinksQuery) => {
    const id = ++reqId.current
    if (loadedOnce.current) setRefreshing(true)
    else setState({ phase: 'loading' })
    try {
      const res = await api.listLinks({
        q: q.q.trim() || undefined,
        status: q.status === 'all' ? undefined : q.status,
        sort: q.sort,
        order: q.order,
        page: q.page,
        pageSize: PAGE_SIZE,
      })
      if (id !== reqId.current) return
      loadedOnce.current = true
      setState({ phase: 'ready', items: res.items, total: res.total })
    } catch (e) {
      if (id !== reqId.current) return
      const message =
        e instanceof ApiError
          ? e.message
          : 'We couldn’t reach the server. Check your connection and try again.'
      setState({ phase: 'error', message })
    } finally {
      if (id === reqId.current) setRefreshing(false)
    }
  }, [])

  // Refetch whenever the query changes, and reflect it in the URL.
  useEffect(() => {
    const sp = paramsFromQuery(query)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    void load(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, load])

  const patchQuery = useCallback((patch: Partial<LinksQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }))
  }, [])

  const onSortChange = useCallback(
    (sort: SortKey) => {
      setQuery((prev) => ({
        ...prev,
        // Re-clicking the active column flips the order; a new column defaults desc.
        order: prev.sort === sort ? (prev.order === 'asc' ? 'desc' : 'asc') : 'desc',
        sort,
        page: 1,
      }))
    },
    [],
  )

  const clearFilters = useCallback(() => {
    setQuery({ ...DEFAULT_QUERY })
  }, [])

  const openDelete = useCallback((link: LinkResource) => {
    setDeleteTarget(link)
    setDeleteOpen(true)
  }, [])

  const handleDeleted = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.phase !== 'ready') return prev
        const items = prev.items.filter((l) => l.id !== id)
        return { phase: 'ready', items, total: Math.max(0, prev.total - 1) }
      })
      // If we emptied the current page (and it isn't page 1), step back a page.
      setQuery((prev) => {
        if (state.phase === 'ready' && state.items.length === 1 && prev.page > 1) {
          return { ...prev, page: prev.page - 1 }
        }
        return prev
      })
    },
    [state],
  )

  const filtersActive = hasActiveFilters(query)

  const headerActions = (
    <Button asChild>
      <Link href="/dashboard/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New link
      </Link>
    </Button>
  )

  // ── Render ──
  let body: React.ReactNode
  if (state.phase === 'loading') {
    body = <LinksLoading />
  } else if (state.phase === 'error') {
    body = <LinksError message={state.message} onRetry={() => load(query)} />
  } else if (state.items.length === 0) {
    body = filtersActive ? <LinksFilteredEmpty onClear={clearFilters} /> : <LinksEmptyState />
  } else {
    body = (
      <>
        <div
          className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          aria-busy={refreshing}
        >
          {/* Desktop table */}
          <div className="hidden md:block">
            <LinksTable
              links={state.items}
              sort={query.sort}
              order={query.order}
              onSortChange={onSortChange}
              onDelete={openDelete}
            />
          </div>
          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {state.items.map((link) => (
              <LinkCard key={link.id} link={link} onDelete={openDelete} />
            ))}
          </div>
        </div>
        <LinksPagination
          page={query.page}
          pageSize={PAGE_SIZE}
          total={state.total}
          onPageChange={(page) => patchQuery({ page })}
        />
      </>
    )
  }

  // Whether to show the toolbar: hide it only on the true zero-links empty state
  // (no filters) and on first load, so users in a filtered-empty view can adjust.
  const showToolbar =
    state.phase === 'ready' && (state.items.length > 0 || filtersActive)

  return (
    <div>
      <PageHeader
        title="Links"
        actions={
          <div className="flex items-center gap-2">
            {refreshing && <Spinner className="h-4 w-4 text-text-tertiary" />}
            {headerActions}
          </div>
        }
      />
      {showToolbar && <LinksToolbar query={query} onChange={patchQuery} />}
      {body}
      <DeleteLinkDialog
        link={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
