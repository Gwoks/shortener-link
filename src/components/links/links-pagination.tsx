'use client'

/**
 * Numbered pager (DESIGN §4.12, FR-29, AC-37). Shows a compact window of page
 * numbers with the current page indicated (aria-current) and prev/next disabled
 * at the bounds. Rendered only when there is more than one page.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'

/** Build a windowed page list with ellipsis sentinels (-1). */
function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: number[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(-1)
    out.push(p)
    prev = p
  }
  return out
}

export function LinksPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const numBtn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-2 text-body-sm transition-colors'

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-caption text-text-tertiary">
        Showing <span className="tnum font-medium text-text-secondary">{start}</span>–
        <span className="tnum font-medium text-text-secondary">{end}</span> of{' '}
        <span className="tnum font-medium text-text-secondary">{total}</span>
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className={cn(
              numBtn,
              'text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {pageWindow(page, totalPages).map((p, i) =>
            p === -1 ? (
              <span key={`gap-${i}`} className="px-1 text-body-sm text-text-tertiary" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  numBtn,
                  p === page
                    ? 'bg-accent-subtle-bg font-medium text-accent'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className={cn(
              numBtn,
              'text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  )
}
