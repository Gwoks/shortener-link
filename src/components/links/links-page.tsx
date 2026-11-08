/**
 * Links list page controller (DESIGN §5.4, USER-JOURNEY §4.5, FR-28/29/30/31).
 * Owns query state (synced to the URL so it survives reload + back/forward) and
 * reads the list through the shared `useLinks` hook, which keeps the previous
 * page visible while the next one loads. Drives the loading / error / empty /
 * filtered-empty / data states, the toolbar, table + mobile cards, pagination,
 * and the shared delete-confirm dialog.
 */
import { Plus } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useInvalidateLinks, useLinks } from '@/data/links'
import { PageHeader } from '../app/app-shell'
import { GuestClaimPrompt } from '../guest/claim-prompt'
import { errorMessage } from '../lib/api'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import { DeleteLinkDialog } from './delete-link-dialog'
import { LinkCard } from './link-card'
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  hasActiveFilters,
  listParamsFromQuery,
  paramsFromQuery,
  queryFromParams,
  type LinksQuery,
  type SortKey,
} from './links-query'
import { LinksPagination } from './links-pagination'
import { LinksEmptyState, LinksError, LinksFilteredEmpty, LinksLoading } from './links-states'
import { LinksTable } from './links-table'
import { LinksToolbar } from './links-toolbar'

const LOAD_ERROR = 'We couldn’t reach the server. Check your connection and try again.'

export function LinksPage() {
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const [searchParams] = useSearchParams()

  // Seed query state from the URL once; thereafter state drives the URL.
  const [query, setQuery] = useState<LinksQuery>(() =>
    queryFromParams(new URLSearchParams(searchParams.toString())),
  )
  const [deleteTarget, setDeleteTarget] = useState<LinkResource | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const listParams = useMemo(() => listParamsFromQuery(query), [query])
  const { data, error, isPending, isFetching, refetch } = useLinks(listParams)
  const invalidateLinks = useInvalidateLinks()
  const refreshing = isFetching && !isPending

  // Reflect the query in the URL.
  useEffect(() => {
    const qs = paramsFromQuery(query).toString()
    navigate(qs ? `${pathname}?${qs}` : pathname, { replace: true })
  }, [query, navigate, pathname])

  const patchQuery = useCallback((patch: Partial<LinksQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }))
  }, [])

  const onSortChange = useCallback((sort: SortKey) => {
    setQuery((prev) => ({
      ...prev,
      // Re-clicking the active column flips the order; a new column defaults desc.
      order: prev.sort === sort ? (prev.order === 'asc' ? 'desc' : 'asc') : 'desc',
      sort,
      page: 1,
    }))
  }, [])

  const clearFilters = useCallback(() => setQuery({ ...DEFAULT_QUERY }), [])

  const openDelete = useCallback((link: LinkResource) => {
    setDeleteTarget(link)
    setDeleteOpen(true)
  }, [])

  // The list refetches via cache invalidation; if we just emptied a page other
  // than the first, step back one page.
  const isLastRowOnPage = data?.items.length === 1
  const handleDeleted = useCallback(() => {
    setQuery((prev) => (isLastRowOnPage && prev.page > 1 ? { ...prev, page: prev.page - 1 } : prev))
  }, [isLastRowOnPage])

  const filtersActive = hasActiveFilters(query)

  // The top nav carries "New link" from sm up; repeat it here only on phones
  // so each screen keeps a single primary action.
  const headerActions = (
    <Button asChild className="sm:hidden">
      <Link to="/dashboard/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New link
      </Link>
    </Button>
  )

  // ── Render ──
  let body: React.ReactNode
  if (isPending) {
    body = <LinksLoading />
  } else if (!data) {
    body = <LinksError message={errorMessage(error, LOAD_ERROR)} onRetry={() => void refetch()} />
  } else if (data.items.length === 0) {
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
              links={data.items}
              sort={query.sort}
              order={query.order}
              onSortChange={onSortChange}
              onDelete={openDelete}
            />
          </div>
          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((link) => (
              <LinkCard key={link.id} link={link} onDelete={openDelete} />
            ))}
          </div>
        </div>
        <LinksPagination
          page={query.page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPageChange={(page) => patchQuery({ page })}
        />
      </>
    )
  }

  // Whether to show the toolbar: hide it only on the true zero-links empty state
  // (no filters) and on first load, so users in a filtered-empty view can adjust.
  const showToolbar = !!data && (data.items.length > 0 || filtersActive)

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
      {/* Guest-claim prompt (FR-34, AC-42): renders only when this browser holds
          still-live guest links; on claim we refetch so they appear in the list. */}
      <GuestClaimPrompt onClaimed={() => void invalidateLinks()} />
    </div>
  )
}
