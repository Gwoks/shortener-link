'use client'

/**
 * Segmented control / filter pills (DESIGN §4.12). Keyboard-navigable group of
 * toggle buttons. Selected = accent-subtle-bg + accent text. Used for analytics
 * range, status filters, and the theme picker. Each option is a real button so
 * it's focusable and operable by keyboard (AC-48).
 */
import { cn } from '../lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  /** Accessible label when `label` is an icon. */
  ariaLabel?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-subtle p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-sm font-medium transition-colors duration-fast',
              size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-body-sm',
              active
                ? 'bg-accent-subtle-bg text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
