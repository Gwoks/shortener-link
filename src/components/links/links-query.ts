/**
 * Links list query state (DESIGN §5.4, FR-29). Shared types + URL <-> state
 * serialization so search/filter/sort/page survive reload and back/forward and
 * map cleanly onto the GET /api/links params (ARCHITECTURE §6.2).
 */

export type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'protected'
export type SortKey = 'created' | 'clicks'
export type SortOrder = 'asc' | 'desc'

export interface LinksQuery {
  q: string
  status: StatusFilter
  sort: SortKey
  order: SortOrder
  page: number
}

export const PAGE_SIZE = 20

export const DEFAULT_QUERY: LinksQuery = {
  q: '',
  status: 'all',
  sort: 'created',
  order: 'desc',
  page: 1,
}

const STATUS_VALUES: StatusFilter[] = ['all', 'active', 'expiring', 'expired', 'protected']

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'protected', label: 'Protected' },
]

export const SORT_OPTIONS: { value: `${SortKey}:${SortOrder}`; label: string }[] = [
  { value: 'created:desc', label: 'Newest' },
  { value: 'created:asc', label: 'Oldest' },
  { value: 'clicks:desc', label: 'Most clicks' },
  { value: 'clicks:asc', label: 'Fewest clicks' },
]

/** Parse query state out of URL search params (defensive against bad values). */
export function queryFromParams(params: URLSearchParams): LinksQuery {
  const status = params.get('status') as StatusFilter | null
  const sort = params.get('sort') === 'clicks' ? 'clicks' : 'created'
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10)
  return {
    q: params.get('q') ?? '',
    status: status && STATUS_VALUES.includes(status) ? status : 'all',
    sort,
    order,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  }
}

/** Serialize query state to a URLSearchParams, omitting defaults for clean URLs. */
export function paramsFromQuery(query: LinksQuery): URLSearchParams {
  const sp = new URLSearchParams()
  if (query.q.trim()) sp.set('q', query.q.trim())
  if (query.status !== DEFAULT_QUERY.status) sp.set('status', query.status)
  if (query.sort !== DEFAULT_QUERY.sort) sp.set('sort', query.sort)
  if (query.order !== DEFAULT_QUERY.order) sp.set('order', query.order)
  if (query.page > 1) sp.set('page', String(query.page))
  return sp
}

/** True when any narrowing filter/search is active (drives filtered-empty copy). */
export function hasActiveFilters(query: LinksQuery): boolean {
  return query.q.trim() !== '' || query.status !== 'all'
}

export const sortValue = (q: LinksQuery): `${SortKey}:${SortOrder}` => `${q.sort}:${q.order}`

export function parseSortValue(value: string): { sort: SortKey; order: SortOrder } {
  const [sort, order] = value.split(':')
  return {
    sort: sort === 'clicks' ? 'clicks' : 'created',
    order: order === 'asc' ? 'asc' : 'desc',
  }
}
