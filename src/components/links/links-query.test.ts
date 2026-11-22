import { describe, expect, it } from 'vitest'
import { isNavActive, NAV_ITEMS } from '../app/nav-items'
import {
  DEFAULT_QUERY,
  hasActiveFilters,
  listParamsFromQuery,
  paramsFromQuery,
  parseSortValue,
  queryFromParams,
  sortValue,
} from './links-query'

describe('links query state', () => {
  it('maps UI state to API list params, dropping the "all" filter and blank search', () => {
    expect(listParamsFromQuery({ ...DEFAULT_QUERY, q: '  ' })).toEqual({
      q: undefined,
      status: undefined,
      sort: 'created',
      order: 'desc',
      page: 1,
      pageSize: 20,
    })
    expect(listParamsFromQuery({ ...DEFAULT_QUERY, q: ' docs ', status: 'active' })).toMatchObject({
      q: 'docs',
      status: 'active',
    })
  })

  it('round-trips through URL params, omitting defaults', () => {
    const query = {
      q: 'docs',
      status: 'expired' as const,
      sort: 'clicks' as const,
      order: 'asc' as const,
      page: 3,
    }
    const params = paramsFromQuery(query)
    expect(params.toString()).toBe('q=docs&status=expired&sort=clicks&order=asc&page=3')
    expect(queryFromParams(params)).toEqual(query)
    expect(paramsFromQuery(DEFAULT_QUERY).toString()).toBe('')
  })

  it('falls back to defaults for malformed params', () => {
    expect(queryFromParams(new URLSearchParams('status=bogus&page=-2&sort=x'))).toEqual(
      DEFAULT_QUERY,
    )
  })

  it('detects active filters and parses sort values', () => {
    expect(hasActiveFilters(DEFAULT_QUERY)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_QUERY, status: 'protected' })).toBe(true)
    expect(sortValue(DEFAULT_QUERY)).toBe('created:desc')
    expect(parseSortValue('clicks:asc')).toEqual({ sort: 'clicks', order: 'asc' })
    expect(parseSortValue('nonsense')).toEqual({ sort: 'created', order: 'desc' })
  })
})

describe('isNavActive', () => {
  const links = NAV_ITEMS.find((i) => i.href === '/dashboard')!
  const analytics = NAV_ITEMS.find((i) => i.href === '/dashboard/analytics')!

  it('matches the index route exactly, plus its per-link pages', () => {
    expect(isNavActive(links, '/dashboard')).toBe(true)
    expect(isNavActive(links, '/dashboard/links/l1/analytics')).toBe(true)
    expect(isNavActive(links, '/dashboard/analytics')).toBe(false)
  })

  it('matches nested routes for section items', () => {
    expect(isNavActive(analytics, '/dashboard/analytics')).toBe(true)
    expect(isNavActive(analytics, '/dashboard/analytics/x')).toBe(true)
    expect(isNavActive(analytics, '/dashboard/bulk')).toBe(false)
  })
})
