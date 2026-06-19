'use client'

/**
 * Per-link analytics screen (DESIGN §5.7, USER-JOURNEY §4.6, FR-7/9/11,
 * AC-10/11/12/14/15/16/49). Loads the link first (header, status, guest flag),
 * then — for owned, non-guest links — fetches the analytics breakdowns. Guest /
 * basic-tier links show only the raw click count with a note (AC-15); expired or
 * deactivated links still show historical analytics with a banner (AC-14). Every
 * chart is paired with an accessible table and a zero-data empty state.
 */
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock,
  Info,
  MousePointerClick,
  QrCode,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../app/app-shell'
import { api, ApiError } from '../lib/api'
import { absoluteTime, displayDestination, formatNumber, relativeTime } from '../lib/format'
import type { AnalyticsRange, LinkAnalytics, LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { LinkStatusBadges } from '../ui/status-badge'
import {
  AnalyticsEmptyState,
  ChartCard,
  ChartCardSkeleton,
  DataTable,
  ProportionBar,
  StatCardNumber,
  StatGridSkeleton,
} from './analytics-primitives'
import {
  BreakdownBarChart,
  ClicksOverTimeChart,
  DonutChart,
  type BreakdownDatum,
} from './charts'
import { RangeSelector, rangeLabel } from './range-selector'
import {
  geoRowLabel,
  percent,
  referrerCategoryLabel,
  referrerRowLabel,
  referrerShortLabel,
  titleizeBucket,
} from './referrer-utils'

type LinkState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; notFound?: boolean }
  | { phase: 'ready'; link: LinkResource }

type DataState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: LinkAnalytics }

export function LinkAnalyticsPage({ id }: { id: string }) {
  const [linkState, setLinkState] = useState<LinkState>({ phase: 'loading' })
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [dataState, setDataState] = useState<DataState>({ phase: 'idle' })

  const loadLink = useCallback(async () => {
    setLinkState({ phase: 'loading' })
    try {
      const res = await api.getLink(id)
      setLinkState({ phase: 'ready', link: res.link })
    } catch (e) {
      if (e instanceof ApiError) {
        const notFound = e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN'
        setLinkState({
          phase: 'error',
          notFound,
          message: notFound
            ? 'This link doesn’t exist, or you don’t have access to it.'
            : e.message,
        })
      } else {
        setLinkState({ phase: 'error', message: 'We couldn’t load this link. Try again.' })
      }
    }
  }, [id])

  const isGuest = linkState.phase === 'ready' && linkState.link.isGuest

  const loadData = useCallback(async () => {
    setDataState({ phase: 'loading' })
    try {
      const data = await api.linkAnalytics(id, range)
      setDataState({ phase: 'ready', data })
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : 'We couldn’t load analytics for this link. Try again.'
      setDataState({ phase: 'error', message })
    }
  }, [id, range])

  useEffect(() => {
    void loadLink()
  }, [loadLink])

  // Fetch breakdowns only once we know the link exists and isn't a guest link.
  useEffect(() => {
    if (linkState.phase === 'ready' && !linkState.link.isGuest) {
      void loadData()
    }
  }, [linkState, loadData])

  // ── Link loading ──
  if (linkState.phase === 'loading') {
    return (
      <div>
        <BackLink />
        <PageHeader title="Analytics" />
        <span className="sr-only" role="status">
          Loading link analytics…
        </span>
        <AnalyticsSkeleton />
      </div>
    )
  }

  // ── Link error / not found ──
  if (linkState.phase === 'error') {
    return (
      <div>
        <BackLink />
        <PageHeader title="Analytics" />
        <div
          role="alert"
          className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="text-h4 text-text-primary">
            {linkState.notFound ? 'Link not found' : 'Couldn’t load this link'}
          </h3>
          <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{linkState.message}</p>
          <div className="mt-5 flex gap-2">
            {!linkState.notFound && (
              <Button variant="secondary" onClick={() => loadLink()}>
                Try again
              </Button>
            )}
            <Button asChild variant={linkState.notFound ? 'primary' : 'ghost'}>
              <Link href="/dashboard">Back to links</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const link = linkState.link
  const status = link.status

  return (
    <div>
      <BackLink />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">/{link.code}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/links/${link.id}`}>Edit</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/links/${link.id}?qr=1`}>
                <QrCode className="h-4 w-4" aria-hidden="true" />
                QR
              </Link>
            </Button>
          </div>
        }
      />

      {/* Context line */}
      <div className="mb-4 rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={link.shortUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-body font-medium text-text-primary hover:text-accent"
          >
            {link.shortUrl}
          </a>
          <LinkStatusBadges link={link} />
        </div>
        <p
          className="mt-1.5 truncate font-mono text-caption text-text-tertiary"
          title={link.destinationUrl}
        >
          {displayDestination(link.destinationUrl)}
        </p>
        <p className="mt-1 text-caption text-text-tertiary">
          <span title={absoluteTime(link.createdAt)}>Created {relativeTime(link.createdAt)}</span>
          {link.expiresAt && (
            <span title={absoluteTime(link.expiresAt)}>
              {' · '}
              {new Date(link.expiresAt).getTime() <= Date.now() ? 'expired' : 'expires'}{' '}
              {relativeTime(link.expiresAt)}
            </span>
          )}
        </p>
      </div>

      {/* Expired / deactivated banner (AC-14) */}
      {(status === 'EXPIRED' || status === 'DEACTIVATED') && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-md border border-border bg-warning-bg px-4 py-2.5 text-body-sm text-warning-fg"
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This link is {status === 'EXPIRED' ? 'expired' : 'deactivated'} — historical analytics
            are shown.
          </span>
        </div>
      )}

      {/* Range selector */}
      {!isGuest && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-body-sm text-text-secondary">{rangeLabel(range)}</p>
          <RangeSelector value={range} onChange={setRange} disabled={dataState.phase === 'loading'} />
        </div>
      )}

      {isGuest ? (
        <GuestBasicAnalytics link={link} />
      ) : (
        <AnalyticsBody state={dataState} range={range} link={link} onRetry={loadData} />
      )}
    </div>
  )
}

/** AC-15: guest links expose only a basic click count — no breakdowns. */
function GuestBasicAnalytics({ link }: { link: LinkResource }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:max-w-xs">
        <StatCardNumber label="Total clicks" value={link.clickCount} icon={MousePointerClick} />
      </div>
      <div className="flex items-start gap-2 rounded-md border border-border bg-surface-subtle p-4 text-body-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <p>
          This is a guest link, so only the basic click count is tracked. Sign-in features like
          unique visitors, clicks over time, referrers, geography, and device breakdowns aren’t
          available for guest links.{' '}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Create an account
          </Link>{' '}
          to get full analytics on new links.
        </p>
      </div>
    </div>
  )
}

function AnalyticsBody({
  state,
  range,
  link,
  onRetry,
}: {
  state: DataState
  range: AnalyticsRange
  link: LinkResource
  onRetry: () => void
}) {
  if (state.phase === 'loading' || state.phase === 'idle') {
    return (
      <>
        <span className="sr-only" role="status">
          Loading analytics…
        </span>
        <AnalyticsSkeleton />
      </>
    )
  }

  // Top-level fetch failure: one error surface with retry (USER-JOURNEY §4.6).
  if (state.phase === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center"
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="text-h4 text-text-primary">Couldn’t load analytics</h3>
        <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{state.message}</p>
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  const data = state.data
  const noData = data.insufficientData || data.totals.clicks === 0

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCardNumber
          label="Total clicks"
          value={data.totals.clicks}
          icon={MousePointerClick}
          hint={rangeLabel(range).toLowerCase()}
        />
        <StatCardNumber
          label="Unique visitors"
          value={data.totals.uniques}
          icon={Users}
          hint={
            data.totals.clicks > 0
              ? `${percent(data.totals.uniques, data.totals.clicks)} of clicks`
              : undefined
          }
        />
      </div>

      {noData ? (
        <ZeroDataState link={link} />
      ) : (
        <>
          <ClicksOverTimeCard series={data.series} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReferrersCard referrers={data.referrers} total={data.totals.clicks} />
            <DevicesCard devices={data.devices} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GeoCard geo={data.geo} total={data.totals.clicks} />
            <BrowsersCard browsers={data.browsers} />
          </div>
        </>
      )}
    </div>
  )
}

/** Page-level zero/insufficient-data state with a share CTA (AC-16). */
function ZeroDataState({ link }: { link: LinkResource }) {
  return (
    <AnalyticsEmptyState
      title="Not enough data yet"
      description={`No clicks have been recorded for ${link.shortUrl} in this range. Share your link to start seeing clicks, referrers, geography, and devices here.`}
      cta={{ href: `/dashboard/links/${link.id}?qr=1`, label: 'Share this link' }}
    />
  )
}

// ── Individual chart cards (chart + accessible table + summary) ──

function ClicksOverTimeCard({ series }: { series: LinkAnalytics['series'] }) {
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
          ? `Peak of ${formatNumber(peak.clicks)} clicks on ${formatDay(peak.day)} across ${series.length} day${series.length === 1 ? '' : 's'}.`
          : undefined
      }
      table={
        <DataTable
          caption="Clicks and unique visitors per day"
          rows={series}
          rowKey={(r) => r.day}
          columns={[
            { key: 'day', header: 'Day', render: (r) => formatDay(r.day) },
            { key: 'clicks', header: 'Clicks', numeric: true, render: (r) => formatNumber(r.clicks) },
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

function ReferrersCard({
  referrers,
  total,
}: {
  referrers: LinkAnalytics['referrers']
  total: number
}) {
  const empty = referrers.length === 0
  const top = referrers.slice(0, 8)
  const chartData: BreakdownDatum[] = top.map((r, i) => ({
    label: referrerShortLabel(r.category, r.host),
    value: r.clicks,
    colorIndex: i,
  }))
  const lead = referrers[0]
  return (
    <ChartCard
      title="Top referrers"
      empty={empty}
      summary={
        lead
          ? `${referrerCategoryLabel(lead.category)} leads with ${formatNumber(lead.clicks)} clicks (${percent(lead.clicks, total)}).`
          : undefined
      }
      table={
        <DataTable
          caption="Clicks by referrer category and source"
          rows={referrers}
          rowKey={(r, i) => `${r.category}-${r.host ?? ''}-${i}`}
          columns={[
            {
              key: 'source',
              header: 'Source',
              render: (r) => referrerRowLabel(r.category, r.host),
            },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (r) => formatNumber(r.clicks),
            },
            { key: 'share', header: 'Share', numeric: true, render: (r) => percent(r.clicks, total) },
          ]}
        />
      }
    >
      <BreakdownBarChart data={chartData} />
    </ChartCard>
  )
}

function GeoCard({ geo, total }: { geo: LinkAnalytics['geo']; total: number }) {
  const empty = geo.length === 0
  const top = geo.slice(0, 8)
  const chartData: BreakdownDatum[] = top.map((g, i) => ({
    label: g.city ?? g.country,
    value: g.clicks,
    colorIndex: i,
  }))
  const max = top.reduce((m, g) => Math.max(m, g.clicks), 0)
  const lead = geo[0]
  return (
    <ChartCard
      title="Geography"
      empty={empty}
      summary={
        lead
          ? `${geoRowLabel(lead.country, lead.city)} is top with ${formatNumber(lead.clicks)} clicks.`
          : undefined
      }
      table={
        <DataTable
          caption="Clicks by country and city"
          rows={geo}
          rowKey={(g, i) => `${g.country}-${g.city ?? ''}-${i}`}
          columns={[
            { key: 'place', header: 'Country / City', render: (g) => geoRowLabel(g.country, g.city) },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (g) => formatNumber(g.clicks),
            },
            {
              key: 'bar',
              header: 'Share',
              render: (g) => (
                <ProportionBar
                  value={g.clicks}
                  max={max}
                  colorVar="var(--chart-3)"
                  label={`${geoRowLabel(g.country, g.city)}: ${percent(g.clicks, total)} of clicks`}
                />
              ),
            },
          ]}
        />
      }
    >
      <BreakdownBarChart data={chartData} />
    </ChartCard>
  )
}

function DevicesCard({ devices }: { devices: LinkAnalytics['devices'] }) {
  const empty = devices.length === 0
  const total = devices.reduce((s, d) => s + d.clicks, 0)
  const chartData: BreakdownDatum[] = devices.map((d, i) => ({
    label: titleizeBucket(d.type),
    value: d.clicks,
    colorIndex: i,
  }))
  const lead = devices[0]
  return (
    <ChartCard
      title="Devices"
      empty={empty}
      summary={
        lead
          ? `${titleizeBucket(lead.type)} accounts for ${percent(lead.clicks, total)} of clicks.`
          : undefined
      }
      table={
        <DataTable
          caption="Clicks by device type"
          rows={devices}
          rowKey={(d, i) => `${d.type}-${i}`}
          columns={[
            { key: 'type', header: 'Device', render: (d) => titleizeBucket(d.type) },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (d) => formatNumber(d.clicks),
            },
            { key: 'share', header: 'Share', numeric: true, render: (d) => percent(d.clicks, total) },
          ]}
        />
      }
    >
      <DonutChart data={chartData} />
    </ChartCard>
  )
}

function BrowsersCard({ browsers }: { browsers: LinkAnalytics['browsers'] }) {
  const empty = browsers.length === 0
  const total = browsers.reduce((s, b) => s + b.clicks, 0)
  const top = browsers.slice(0, 8)
  const chartData: BreakdownDatum[] = top.map((b, i) => ({
    label: titleizeBucket(b.name),
    value: b.clicks,
    colorIndex: i,
  }))
  const lead = browsers[0]
  return (
    <ChartCard
      title="Browsers"
      empty={empty}
      summary={
        lead
          ? `${titleizeBucket(lead.name)} is most common (${percent(lead.clicks, total)}).`
          : undefined
      }
      table={
        <DataTable
          caption="Clicks by browser"
          rows={browsers}
          rowKey={(b, i) => `${b.name}-${i}`}
          columns={[
            { key: 'name', header: 'Browser', render: (b) => titleizeBucket(b.name) },
            {
              key: 'clicks',
              header: 'Clicks',
              numeric: true,
              render: (b) => formatNumber(b.clicks),
            },
            { key: 'share', header: 'Share', numeric: true, render: (b) => percent(b.clicks, total) },
          ]}
        />
      }
    >
      <BreakdownBarChart data={chartData} />
    </ChartCard>
  )
}

// ── helpers ──

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

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <StatGridSkeleton count={2} />
      <ChartCardSkeleton height={260} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <div className="mb-2 flex items-center gap-2 text-body-sm">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Links
      </Link>
      <Link
        href="/dashboard/analytics"
        className="inline-flex items-center gap-1.5 rounded-sm text-text-tertiary transition-colors hover:text-text-primary"
      >
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        All analytics
      </Link>
    </div>
  )
}
