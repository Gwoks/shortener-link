'use client'

/**
 * Recharts wrappers (DESIGN §5.7/§5.8). Recharts is client-only, so every export
 * here is a client component; the surrounding controllers only mount these after
 * data loads, keeping SSR/build clean. Colors come from the token-driven palette
 * (useChartTheme) so dark/light stay consistent, and animation is disabled under
 * prefers-reduced-motion (AC-50). Charts are decorative — each is always paired
 * with an accessible table by the caller (AC-49) and marked aria-hidden here.
 */
import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '../lib/format'
import { useChartTheme, type ChartTheme } from './chart-theme'

/** Avoid recharts measuring a 0-size container on the very first client paint. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function TooltipBox({
  theme,
  rows,
  title,
}: {
  theme: ChartTheme
  title?: string
  rows: Array<{ label: string; value: number; color?: string }>
}) {
  return (
    <div
      className="rounded-sm border px-3 py-2 text-body-sm shadow-md"
      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
    >
      {title && <div className="mb-1 font-medium">{title}</div>}
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 tabular-nums">
            {r.color && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-pill"
                style={{ backgroundColor: r.color }}
              />
            )}
            <span className="text-text-secondary">{r.label}</span>
            <span className="ml-auto font-medium">{formatNumber(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface SeriesPoint {
  day: string
  clicks: number
  uniques: number
}

/** Compact day label, e.g. "Jun 3". */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Clicks-over-time as an area chart with a unique-visitors overlay (AC-12). */
export function ClicksOverTimeChart({
  data,
  height = 260,
}: {
  data: SeriesPoint[]
  height?: number
}) {
  const theme = useChartTheme()
  const mounted = useMounted()
  if (!mounted) return <ChartBox height={height} />

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.series[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={theme.series[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            stroke={theme.axis}
            tick={{ fontSize: 11, fill: theme.axis }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            minTickGap={24}
          />
          <YAxis
            stroke={theme.axis}
            tick={{ fontSize: 11, fill: theme.axis }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: theme.grid }}
            content={({ active, payload, label }) =>
              active && payload && payload.length ? (
                <TooltipBox
                  theme={theme}
                  title={dayLabel(String(label))}
                  rows={[
                    { label: 'Clicks', value: Number(payload[0]?.value ?? 0), color: theme.series[0] },
                    {
                      label: 'Unique',
                      value: Number(payload[1]?.value ?? 0),
                      color: theme.series[1],
                    },
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="clicks"
            name="Clicks"
            stroke={theme.series[0]}
            strokeWidth={2}
            fill="url(#clicksFill)"
            isAnimationActive={!theme.reducedMotion}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="uniques"
            name="Unique"
            stroke={theme.series[1]}
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="transparent"
            isAnimationActive={!theme.reducedMotion}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

export interface BreakdownDatum {
  label: string
  value: number
  /** Optional explicit color index into the palette. */
  colorIndex?: number
}

/** Horizontal bar chart for ranked categorical breakdowns (referrers, geo). */
export function BreakdownBarChart({
  data,
  height = 220,
}: {
  data: BreakdownDatum[]
  height?: number
}) {
  const theme = useChartTheme()
  const mounted = useMounted()
  if (!mounted) return <ChartBox height={height} />

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            stroke={theme.axis}
            tick={{ fontSize: 11, fill: theme.axis }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={theme.axis}
            tick={{ fontSize: 11, fill: theme.axis }}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: theme.grid, fillOpacity: 0.25 }}
            content={({ active, payload }) =>
              active && payload && payload.length ? (
                <TooltipBox
                  theme={theme}
                  title={String(payload[0]?.payload?.label ?? '')}
                  rows={[{ label: 'Clicks', value: Number(payload[0]?.value ?? 0) }]}
                />
              ) : null
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={!theme.reducedMotion}>
            {data.map((d, i) => (
              <Cell key={i} fill={theme.series[(d.colorIndex ?? i) % theme.series.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

/** Donut chart for device/browser split (AC-10). Legend lives in the table. */
export function DonutChart({
  data,
  height = 220,
}: {
  data: BreakdownDatum[]
  height?: number
}) {
  const theme = useChartTheme()
  const mounted = useMounted()
  if (!mounted) return <ChartBox height={height} />
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <ChartBox height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            isAnimationActive={!theme.reducedMotion}
            stroke={theme.surface}
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={theme.series[(d.colorIndex ?? i) % theme.series.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload && payload.length ? (
                <TooltipBox
                  theme={theme}
                  rows={[
                    {
                      label: String(payload[0]?.name ?? ''),
                      value: Number(payload[0]?.value ?? 0),
                      color: theme.series[(Number(payload[0]?.payload?.colorIndex) || 0) % theme.series.length],
                    },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="-mt-2 text-center text-caption text-text-tertiary">
        {formatNumber(total)} total clicks
      </p>
    </ChartBox>
  )
}

/** Fixed-height, aria-hidden frame around a chart (the table carries the data). */
function ChartBox({ height, children }: { height: number; children?: React.ReactNode }) {
  return (
    <div aria-hidden="true" style={{ height }} className="w-full">
      {children}
    </div>
  )
}
