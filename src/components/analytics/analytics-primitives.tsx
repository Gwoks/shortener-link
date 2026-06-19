'use client'

/**
 * Shared analytics building blocks (DESIGN §5.7/§5.8, AC-49/AC-16, FR-11/43).
 * Each chart is wrapped in a `ChartCard` that pairs the visual with an accessible
 * data table (AC-49: analytics are never vision-only), shows a token-driven empty
 * state when there is not enough data (AC-16), and supports loading/error surfaces
 * (USER-JOURNEY §4.6). All purely presentational except the table toggle state.
 */
import Link from 'next/link'
import { AlertTriangle, BarChart3, Table2, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../lib/cn'
import { formatNumber } from '../lib/format'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'

/** KPI tile (DESIGN §5.7 stat cards). Numeric value is the source of truth. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-caption font-medium text-text-tertiary">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-h2 tabular-nums text-text-primary">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-text-tertiary">{hint}</div>}
    </div>
  )
}

/** Convenience wrapper for numeric stat tiles. */
export function StatCardNumber(props: {
  label: string
  value: number
  hint?: string
  icon?: LucideIcon
}) {
  return <StatCard {...props} value={formatNumber(props.value)} />
}

export interface TableColumn<Row> {
  key: string
  header: string
  /** Render the cell; the first column is rendered as a row header (<th scope="row">). */
  render: (row: Row) => React.ReactNode
  align?: 'left' | 'right'
  numeric?: boolean
}

/**
 * Accessible data table equivalent for a chart (AC-49). The first column is a
 * row header; numeric columns get scope="col" + right alignment + tabular nums.
 */
export function DataTable<Row>({
  columns,
  rows,
  caption,
  rowKey,
  className,
}: {
  columns: TableColumn<Row>[]
  rows: Row[]
  caption: string
  rowKey: (row: Row, index: number) => string
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-tertiary',
                  col.align === 'right' || col.numeric ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-border last:border-0">
              {columns.map((col, ci) =>
                ci === 0 ? (
                  <th
                    key={col.key}
                    scope="row"
                    className="px-3 py-2 text-left font-medium text-text-primary"
                  >
                    {col.render(row)}
                  </th>
                ) : (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-2 text-text-secondary',
                      col.align === 'right' || col.numeric
                        ? 'text-right tabular-nums'
                        : 'text-left',
                    )}
                  >
                    {col.render(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Card frame for one analytics dimension. Renders a title, an optional one-line
 * text summary (AC-49), the chart, and a "View as table" toggle that reveals the
 * accessible <table> equivalent. When `empty`, it shows the share-this-link empty
 * state instead of the chart (AC-16); when `error`, a retry surface.
 */
export function ChartCard({
  title,
  summary,
  empty,
  error,
  onRetry,
  table,
  children,
  className,
  tableDefaultOpen = false,
}: {
  title: string
  /** One-line plain-text summary read alongside the chart (AC-49). */
  summary?: React.ReactNode
  empty?: boolean
  error?: string | null
  onRetry?: () => void
  /** The accessible table equivalent, revealed by the toggle (AC-49). */
  table?: React.ReactNode
  children: React.ReactNode
  className?: string
  tableDefaultOpen?: boolean
}) {
  const [showTable, setShowTable] = useState(tableDefaultOpen)
  const tableId = useId()

  return (
    <section
      aria-label={title}
      className={cn('flex flex-col rounded-md border border-border bg-surface p-4 sm:p-5', className)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h4 text-text-primary">{title}</h3>
          {summary && !empty && !error && (
            <p className="mt-0.5 text-caption text-text-secondary">{summary}</p>
          )}
        </div>
        {table && !empty && !error && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable((v) => !v)}
          >
            <Table2 className="h-4 w-4" aria-hidden="true" />
            {showTable ? 'Hide table' : 'View as table'}
          </Button>
        )}
      </div>

      {error ? (
        <ChartError message={error} onRetry={onRetry} />
      ) : empty ? (
        <ChartEmpty />
      ) : (
        <>
          <div className="min-w-0">{children}</div>
          {table && (
            <div id={tableId} hidden={!showTable} className="mt-4 border-t border-border pt-3">
              {table}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Zero / insufficient-data empty state for a single chart (AC-16, FR-11). */
export function ChartEmpty({
  message = 'Not enough data yet. Once people start clicking, this chart will fill in.',
}: {
  message?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-surface-subtle px-4 py-10 text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-pill bg-surface text-text-tertiary">
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="max-w-xs text-body-sm text-text-secondary">{message}</p>
    </div>
  )
}

/** Per-surface error state with retry (USER-JOURNEY §4.6 error row). */
export function ChartError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border bg-surface-subtle px-4 py-10 text-center"
    >
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="max-w-xs text-body-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Full-page empty state with a primary CTA (AC-16 page level / DESIGN §5.8). */
export function AnalyticsEmptyState({
  title,
  description,
  cta,
}: {
  title: string
  description: string
  cta?: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-subtle text-text-tertiary">
        <BarChart3 className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-h4 text-text-primary">{title}</h3>
      <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{description}</p>
      {cta && (
        <Button asChild className="mt-5">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
    </div>
  )
}

/** Bar-style horizontal proportion meter used by ranked lists in tables. */
export function ProportionBar({
  value,
  max,
  colorVar,
  label,
}: {
  value: number
  max: number
  colorVar: string
  label: string
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <span
      className="block h-1.5 w-full overflow-hidden rounded-pill bg-surface-active"
      role="img"
      aria-label={label}
    >
      <span
        className="block h-full rounded-pill"
        style={{ width: `${pct}%`, backgroundColor: colorVar }}
      />
    </span>
  )
}

/** Skeleton for a stat tile grid. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton standing in for a chart card while data loads (FR-43). */
export function ChartCardSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1.5 h-3 w-56" />
      <div className="skeleton mt-4 w-full rounded-sm" style={{ height }} aria-hidden="true" />
    </div>
  )
}
