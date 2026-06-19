'use client'

/**
 * Links list toolbar (DESIGN §4.12/§5.4, FR-29). Search box (debounced),
 * status filter pills (Segmented), and a sort control (native <select> for
 * robust keyboard/AT support). On mobile the filter pills become a
 * horizontally-scrollable row — the pills scroll, the page never does (AC-51).
 */
import { ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { Segmented, type SegmentedOption } from '../ui/segmented'
import {
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type LinksQuery,
  type SortKey,
  type SortOrder,
  type StatusFilter,
} from './links-query'

const STATUS_SEGMENTS: SegmentedOption<StatusFilter>[] = STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId()
  const [local, setLocal] = useState(value)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the local field in sync when the query is reset externally (clear filters).
  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current)
  }, [])

  function emit(next: string) {
    setLocal(next)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => onChange(next), 300)
  }

  return (
    <div className="relative w-full sm:w-64">
      <label htmlFor={id} className="sr-only">
        Search links
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={local}
        placeholder="Search links…"
        onChange={(e) => emit(e.target.value)}
        className={cn(
          'h-9 w-full rounded-sm border border-border-strong bg-surface pl-9 pr-9 text-body-sm text-text-primary placeholder:text-text-tertiary',
          'transition-colors duration-fast focus:border-accent',
        )}
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal('')
            if (debounce.current) clearTimeout(debounce.current)
            onChange('')
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-text-tertiary hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function SortSelect({
  sort,
  order,
  onChange,
}: {
  sort: SortKey
  order: SortOrder
  onChange: (next: { sort: SortKey; order: SortOrder }) => void
}) {
  const id = useId()
  const value = `${sort}:${order}`
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="hidden whitespace-nowrap text-body-sm text-text-secondary sm:block">
        Sort
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':')
            onChange({ sort: s === 'clicks' ? 'clicks' : 'created', order: o === 'asc' ? 'asc' : 'desc' })
          }}
          className={cn(
            'h-9 appearance-none rounded-sm border border-border-strong bg-surface pl-3 pr-8 text-body-sm text-text-primary',
            'transition-colors duration-fast focus:border-accent',
          )}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

export function LinksToolbar({
  query,
  onChange,
}: {
  query: LinksQuery
  onChange: (patch: Partial<LinksQuery>) => void
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox value={query.q} onChange={(q) => onChange({ q, page: 1 })} />
        <SortSelect
          sort={query.sort}
          order={query.order}
          onChange={({ sort, order }) => onChange({ sort, order, page: 1 })}
        />
      </div>
      {/* Pills scroll horizontally on small screens; the page does not (AC-51). */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          ariaLabel="Filter links by status"
          options={STATUS_SEGMENTS}
          value={query.status}
          onChange={(status) => onChange({ status, page: 1 })}
          className="w-max"
        />
      </div>
    </div>
  )
}
