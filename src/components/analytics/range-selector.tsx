'use client'

/**
 * Analytics time-range selector (DESIGN §5.7). Segmented control on desktop;
 * collapses to a native <select> on mobile (DESIGN §5.7 "range selector becomes a
 * select"). Options are limited to what the API supports (7d/30d/90d/all) — we do
 * not offer a window the backend cannot serve.
 */
import type { AnalyticsRange } from '../lib/types'
import { Segmented, type SegmentedOption } from '../ui/segmented'

const OPTIONS: SegmentedOption<AnalyticsRange>[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const SHORT: Record<AnalyticsRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

export function rangeLabel(range: AnalyticsRange): string {
  return SHORT[range]
}

export function RangeSelector({
  value,
  onChange,
  disabled,
}: {
  value: AnalyticsRange
  onChange: (v: AnalyticsRange) => void
  disabled?: boolean
}) {
  return (
    <div>
      {/* Desktop: segmented control */}
      <div className="hidden sm:block">
        <Segmented
          ariaLabel="Time range"
          options={OPTIONS}
          value={value}
          onChange={onChange}
          size="sm"
        />
      </div>
      {/* Mobile: native select */}
      <div className="sm:hidden">
        <label className="sr-only" htmlFor="analytics-range">
          Time range
        </label>
        <select
          id="analytics-range"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as AnalyticsRange)}
          className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 text-body-sm text-text-primary transition-colors duration-fast focus:border-accent"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {SHORT[o.value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
