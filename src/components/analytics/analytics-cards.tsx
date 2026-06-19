'use client'

/**
 * Shared breakdown cards (referrers / geography / devices / browsers) used by
 * BOTH the per-link analytics page and the aggregate analytics page. Each card
 * is a chart paired with an accessible data table (AC-49). The input shapes are
 * identical between `LinkAnalytics` and `SummaryAnalytics`, so the cards are
 * typed against those shared shapes and are page-agnostic.
 */
import { formatNumber } from '../lib/format'
import { ChartCard, DataTable, ProportionBar } from './analytics-primitives'
import { BreakdownBarChart, DonutChart, type BreakdownDatum } from './charts'
import {
  geoRowLabel,
  percent,
  referrerCategoryLabel,
  referrerRowLabel,
  referrerShortLabel,
  titleizeBucket,
} from './referrer-utils'

type Referrers = Array<{ category: string; host: string | null; clicks: number }>
type Geo = Array<{ country: string; city: string | null; clicks: number }>
type Devices = Array<{ type: string; clicks: number }>
type Browsers = Array<{ name: string; clicks: number }>

export function ReferrersCard({ referrers, total }: { referrers: Referrers; total: number }) {
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

export function GeoCard({ geo, total }: { geo: Geo; total: number }) {
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

export function DevicesCard({ devices }: { devices: Devices }) {
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

export function BrowsersCard({ browsers }: { browsers: Browsers }) {
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
