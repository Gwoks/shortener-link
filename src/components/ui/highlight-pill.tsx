/**
 * Hero Highlight Pill (DESIGN.md) — a colored pill set behind a single word in
 * display copy. Padding is em-based so it scales with the headline size.
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type PillTone = 'peach' | 'marigold' | 'coral'

const TONE: Record<PillTone, string> = {
  peach: 'bg-peach',
  marigold: 'bg-marigold',
  coral: 'bg-coral',
}

export function HighlightPill({
  tone = 'peach',
  children,
  className,
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-pill px-[0.3em] pb-[0.06em] text-black',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
