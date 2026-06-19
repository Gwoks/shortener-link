'use client'

/**
 * Aggregate analytics across all of a user's links (DESIGN §5.8, USER-JOURNEY
 * §4.6, FR-8, AC-13/16/49). Sums via the summary endpoint (totals, clicks-over-
 * time, top links). Total/active link counts come from the list endpoint. The
 * summary endpoint does not return referrer/geo/device breakdowns, so — to avoid
 * fabricating empty dimensions (AC-15 spirit) — those live on each per-link page,
 * surfaced via the top-links table links. Every chart is paired with a table.
 */
import {
  AlertTriangle,
  ArrowUpRight,
  Link2,
  MousePointerClick,
  ToggleRight,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../app/app-shell'
import { api, ApiError } from '../lib/api'
import { formatNumber } from '../lib/format'
import type { AnalyticsRange, SummaryAnalytics } from '../lib/types'
import { Button } from '../ui/button'
import {
  AnalyticsEmptyState,
  ChartCard,
  ChartCardSkeleton,
  DataTable,
  ProportionBar,
  StatCardNumber,
  StatGridSkeleton,
} from './analytics-primitives'
import { ClicksOverTimeChart } from './charts'
import { RangeSelector, rangeLabel } from './range-selector'
import { percent } from './referrer-utils'

interface Loaded {
  summary: SummaryAnalytics
  totalLinks: number
  activeLinks: number
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: Loaded }

export function SummaryAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const [summary, total, active] = await Promise.all([
        api.summary(range),
        api.listLinks({ pageSize: 1 }),
        api.listLinks({ status: 'active', pageSize: 1 }),
      ])
      setState({
        phase: 'ready',
        data: { summary, totalLinks: total.total, activeLinks: active.total },
      })
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : 'We couldn’t load your analytics. Try again.'
      setState({ phase: 'error', message })
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Performance across all your links."
        actions={
          state.phase === 'ready' && state.data.totalLinks > 0 ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-body-sm text-text-secondary sm:inline">
                {rangeLabel(range)}
              </span>
              <RangeSelector value={range} onChange={setRange} disabled={false} />
            </div>
          ) : undefined
        }
      />

      {state.phase === 'loading' && (
        <>
          <span className="sr-only" role="status">
            Loading analytics…
          </span>
          <SummarySkeleton />
        </>
      )}

      {state.phase === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="text-h4 text-text-primary">Couldn’t load analytics</h3>
          <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{state.message}</p>
          <Button variant="secondary" className="mt-5" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {state.phase === 'ready' && <SummaryBody data={state.data} range={range} />}
    </div>
  )
}

function SummaryBody({ data, range }: { data: Loaded; range: AnalyticsRange }) {
  const { summary, totalLinks, activeLinks } = data

  // No links at all → guided empty state mirroring the dashboard (DESIGN §5.8).
  if (totalLinks === 0) {
    return (
      <AnalyticsEmptyState
        title="No links yet"
        description="Create your first link to start tracking clicks, unique visitors, and trends across everything you share."
        cta={{ href: '/dashboard/new', label: 'Create a link' }}
      />
    )
  }

  const noClicks = summary.insufficientData || summary.totals.clicks === 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCardNumber
          label="Total clicks"
          value={summary.totals.clicks}
          icon={MousePointerClick}
          hint={rangeLabel(range).toLowerCase()}
        />
        <StatCardNumber
          label="Unique visitors"
          value={summary.totals.uniques}
          icon={Users}
          hint={
            summary.totals.clicks > 0
              ? `${percent(summary.totals.uniques, summary.totals.clicks)} of clicks`
              : undefined
          }
        />
        <StatCardNumber label="Total links" value={totalLinks} icon={Link2} />
        <StatCardNumber label="Active links" value={activeLinks} icon={ToggleRight} />
      </div>

      {noClicks ? (
        <AnalyticsEmptyState
          title="Not enough data yet"
          description="None of your links have clicks in this range. Share your links to start seeing aggregate trends and your top performers here."
          cta={{ href: '/dashboard', label: 'View your links' }}
        />
      ) : (
        <>
          <ClicksOverTimeCard series={summary.series} />
          <TopLinksCard topLinks={summary.topLinks} total={summary.totals.clicks} />
          <p className="text-caption text-text-tertiary">
            Referrer, geography, and device breakdowns are available per link — open a link below to
            see them.
          </p>
        </>
      )}
    </div>
  )
}

function ClicksOverTimeCard({ series }: { series: SummaryAnalytics['series'] }) {
  const empty = series.length === 0 || series.every((s) => s.clicks === 0)
  const peak = series.reduce(
    (best, s) => (s.clicks > best.clicks ? s : best),
    { day: '', clicks: 0, uniques: 0 },
  )
  return (
    <ChartCard
      title="Clicks over time"
      empty={empty}
      summary={
        peak.clicks > 0
          ? `Peak of ${formatNumber(peak.clicks)} clicks on ${formatDay(peak.day)} across all links.`
          : undefined
      }
      table={
        <DataTable
          caption="Total clicks and unique visitors per day across all links"
          rows={series}
          rowKey={(r) => r.day}
          columns={[
            { key: 'day', header: 'Day', render: (r) => formatDay(r.day) },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (r) => formatNumber(r.clicks),
            },
            {
              key: 'uniques',
              header: 'Unique',
              numeric: true,
              render: (r) => formatNumber(r.uniques),
            },
          ]}
        />
      }
    >
      <ClicksOverTimeChart data={series} />
    </ChartCard>
  )
}

function TopLinksCard({
  topLinks,
  total,
}: {
  topLinks: SummaryAnalytics['topLinks']
  total: number
}) {
  const empty = topLinks.length === 0
  const max = topLinks.reduce((m, l) => Math.max(m, l.clicks), 0)
  return (
    <ChartCard
      title="Top links"
      empty={empty}
      summary={
        topLinks[0]
          ? `/${topLinks[0].code} leads with ${formatNumber(topLinks[0].clicks)} clicks.`
          : undefined
      }
      table={
        <DataTable
          caption="Links ranked by total clicks"
          rows={topLinks}
          rowKey={(l) => l.linkId}
          columns={[
            {
              key: 'code',
              header: 'Link',
              render: (l) => (
                <Link
                  href={`/dashboard/links/${l.linkId}/analytics`}
                  className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                >
                  /{l.code}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ),
            },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (l) => formatNumber(l.clicks),
            },
            { key: 'share', header: 'Share', numeric: true, render: (l) => percent(l.clicks, total) },
            {
              key: 'bar',
              header: 'Distribution',
              render: (l) => (
                <ProportionBar
                  value={l.clicks}
                  max={max}
                  colorVar="var(--chart-1)"
                  label={`/${l.code}: ${percent(l.clicks, total)} of clicks`}
                />
              ),
            },
          ]}
        />
      }
    >
      {/* Ranked bars as the visual; the table above mirrors it (AC-49). */}
      <ul className="space-y-2" aria-hidden="true">
        {topLinks.slice(0, 8).map((l) => (
          <li key={l.linkId} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
            <span className="truncate font-mono text-body-sm text-text-secondary">/{l.code}</span>
            <ProportionBar
              value={l.clicks}
              max={max}
              colorVar="var(--chart-1)"
              label={`/${l.code}`}
            />
            <span className="tabular-nums text-body-sm text-text-secondary">
              {formatNumber(l.clicks)}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

function formatDay(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <StatGridSkeleton count={4} />
      <ChartCardSkeleton height={260} />
      <ChartCardSkeleton height={200} />
    </div>
  )
}
