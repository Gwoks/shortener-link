'use client'

/**
 * Links list non-data states (DESIGN §4.5/§4.10/§5.4, USER-JOURNEY §4.5).
 * Loading skeletons (table rows + mobile cards), the guided zero-links empty
 * state (single create CTA, AC-39), the filtered-empty state (clear filters),
 * and an inline error state with a retry affordance (FR-37). Shapes mirror the
 * real content so the layout doesn't jump.
 */
import { AlertTriangle, LinkIcon, Plus, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'

/** Desktop skeleton rows. */
export function LinksTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface" aria-hidden="true">
      <div className="border-b border-border bg-surface-subtle px-3 py-2.5">
        <Skeleton className="h-3 w-24" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-4 last:border-b-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-pill" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-7 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mobile skeleton cards. */
export function LinksCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20 rounded-pill" />
          </div>
          <Skeleton className="mt-3 h-3 w-3/4" />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-16 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Combined loading state with a polite live announcement. */
export function LinksLoading() {
  return (
    <div>
      <span className="sr-only" role="status">
        Loading your links…
      </span>
      <div className="hidden md:block">
        <LinksTableSkeleton />
      </div>
      <div className="md:hidden">
        <LinksCardsSkeleton />
      </div>
    </div>
  )
}

/** Zero-links guided empty state — a single primary CTA (AC-39). */
export function LinksEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-accent-subtle-bg text-accent">
        <LinkIcon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-h3 text-text-primary">Create your first short link</h3>
      <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">
        Shorten a long URL to get a clean, shareable link with click analytics, a QR code, and optional
        expiry.
      </p>
      <Button asChild className="mt-5">
        <Link to="/dashboard/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New link
        </Link>
      </Button>
    </div>
  )
}

/** Filtered-empty state — search/filters returned nothing (DESIGN §5.4). */
export function LinksFilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-subtle text-text-tertiary">
        <SearchX className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-h4 text-text-primary">No links match these filters</h3>
      <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">
        Try a different search term or clear the filters to see all your links.
      </p>
      <Button variant="secondary" className="mt-5" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}

/** Inline error state with retry (FR-37). */
export function LinksError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-md border border-border bg-danger-bg/40 px-6 py-16 text-center"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-h4 text-text-primary">Couldn’t load your links</h3>
      <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{message}</p>
      <Button variant="secondary" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
