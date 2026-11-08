/**
 * Per-link analytics screen (DESIGN §5.7, USER-JOURNEY §4.6, FR-7/9/11,
 * AC-10/11/12/14/15/16/49). Loads the link first via `useLink` (header, status,
 * guest flag), then — for owned, non-guest links — the breakdowns via
 * `useLinkAnalytics`. Guest /
 * basic-tier links show only the raw click count with a note (AC-15); expired or
 * deactivated links still show historical analytics with a banner (AC-14). Every
 * chart is paired with an accessible table and a zero-data empty state.
 */
import { Info, MousePointerClick, QrCode, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useLink } from '@/data/links'
import { useLinkAnalytics } from '@/data/analytics'
import { PageHeader } from '../app/app-shell'
import { errorMessage } from '../lib/api'
import type { AnalyticsRange, LinkAnalytics, LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { InlineAlert } from '../ui/alert'
import { Card } from '../ui/card'
import { StateCard } from '../ui/state-card'
import { BackLink, LinkLoadError, LinkSummaryCard } from '../links/link-page-parts'
import { BreakdownGrid, ClicksOverTimeCard } from './analytics-cards'
import {
  AnalyticsEmptyState,
  ChartCardSkeleton,
  StatCardNumber,
  StatGridSkeleton,
} from './analytics-primitives'
import { RangeSelector, rangeLabel } from './range-selector'
import { percent } from './referrer-utils'

const PAGE_TITLE = 'Analytics'

function BackLinks() {
  return (
    <div className="flex flex-wrap gap-x-5">
      <BackLink />
      <BackLink to="/dashboard/analytics" label="All analytics" />
    </div>
  )
}

export function LinkAnalyticsPage({ id }: { id: string }) {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const linkQuery = useLink(id)
  const link = linkQuery.data
  const isGuest = link?.isGuest ?? false
  // Fetch breakdowns only once we know the link exists and isn't a guest link.
  const analytics = useLinkAnalytics(id, range, !!link && !isGuest)

  if (linkQuery.isPending) {
    return (
      <div>
        <BackLinks />
        <PageHeader title={PAGE_TITLE} />
        <span className="sr-only" role="status">
          Loading link analytics…
        </span>
        <AnalyticsSkeleton />
      </div>
    )
  }

  if (!link) {
    return (
      <div>
        <BackLinks />
        <PageHeader title={PAGE_TITLE} />
        <LinkLoadError error={linkQuery.error} onRetry={() => void linkQuery.refetch()} />
      </div>
    )
  }

  const status = link.status

  return (
    <div>
      <BackLinks />
      <PageHeader
        title={<span className="font-mono">/{link.code}</span>}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/dashboard/links/${link.id}`}>Edit</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/dashboard/links/${link.id}?qr=1`}>
                <QrCode className="h-4 w-4" aria-hidden="true" />
                QR
              </Link>
            </Button>
          </>
        }
      />

      <LinkSummaryCard link={link} className="mb-4" />

      {/* Expired / deactivated banner (AC-14) */}
      {(status === 'EXPIRED' || status === 'DEACTIVATED') && (
        <InlineAlert tone="warning" className="mb-4">
          This link is {status === 'EXPIRED' ? 'expired' : 'deactivated'} — historical analytics are
          shown.
        </InlineAlert>
      )}

      {/* Range selector */}
      {!isGuest && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-body-sm text-text-secondary">{rangeLabel(range)}</p>
          <RangeSelector value={range} onChange={setRange} disabled={analytics.isFetching} />
        </div>
      )}

      {isGuest ? (
        <GuestBasicAnalytics link={link} />
      ) : (
        <AnalyticsBody
          data={analytics.data}
          error={analytics.error}
          range={range}
          link={link}
          onRetry={() => void analytics.refetch()}
        />
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
      <Card tone="tint" padding="sm" className="flex items-start gap-2 text-body-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <p>
          This is a guest link, so only the basic click count is tracked. Sign-in features like
          unique visitors, clicks over time, referrers, geography, and device breakdowns aren’t
          available for guest links.{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Create an account
          </Link>{' '}
          to get full analytics on new links.
        </p>
      </Card>
    </div>
  )
}

function AnalyticsBody({
  data,
  error,
  range,
  link,
  onRetry,
}: {
  data: LinkAnalytics | undefined
  error: unknown
  range: AnalyticsRange
  link: LinkResource
  onRetry: () => void
}) {
  if (!data && !error) {
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
  if (!data) {
    return (
      <StateCard
        tone="error"
        title="Couldn’t load analytics"
        description={errorMessage(error, 'We couldn’t load analytics for this link. Try again.')}
        actions={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    )
  }
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
          <ClicksOverTimeCard series={data.series} scope="link" />
          <BreakdownGrid data={data} />
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
