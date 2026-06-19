import { cn } from '../lib/cn'

/**
 * Spinner (DESIGN §4.10). Under prefers-reduced-motion the spin animation is
 * suppressed by the global CSS rule; we keep the ring visible as a static cue.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]',
        className,
      )}
    />
  )
}
