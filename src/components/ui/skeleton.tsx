import { cn } from '../lib/cn'

/**
 * Skeleton (DESIGN §4.10, FR-43, AC-50). Shimmer sweep on a muted block; under
 * prefers-reduced-motion the global CSS turns it into a static block. Shapes
 * should mirror final content.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />
}

/** A block of skeleton lines for text placeholders. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}
