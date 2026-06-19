/**
 * Status badge (DESIGN §4.4, FR-30, AC-38). ALWAYS icon + text label — never
 * color alone, verifiable in grayscale. The password-protected state co-occurs
 * as a small leading lock adornment alongside the primary status pill.
 */
import { Ban, CheckCircle2, Clock, Loader2, Lock, XCircle } from 'lucide-react'
import { cn } from '../lib/cn'
import type { LinkResource } from '../lib/types'
import { presentationStatus, type PresentationStatus } from '../lib/format'

const CONFIG: Record<
  PresentationStatus,
  { icon: typeof CheckCircle2; label: string; cls: string; spin?: boolean }
> = {
  active: { icon: CheckCircle2, label: 'Active', cls: 'text-success-fg bg-success-bg' },
  expiring: { icon: Clock, label: 'Expiring', cls: 'text-warning-fg bg-warning-bg' },
  expired: { icon: XCircle, label: 'Expired', cls: 'text-danger-fg bg-danger-bg' },
  deactivated: { icon: Ban, label: 'Off', cls: 'text-danger-fg bg-danger-bg' },
  pending: { icon: Loader2, label: 'Fetching…', cls: 'text-info-fg bg-info-bg', spin: true },
}

export function StatusBadge({ status, className }: { status: PresentationStatus; className?: string }) {
  const c = CONFIG[status]
  const Icon = c.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-medium',
        c.cls,
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', c.spin && 'animate-spin')} aria-hidden="true" />
      {c.label}
    </span>
  )
}

/** Small neutral lock chip for password-protected links (DESIGN §4.4). */
export function ProtectedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-lock-bg px-2 py-0.5 text-caption font-medium text-lock-fg',
        className,
      )}
      title="Password-protected"
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      Protected
    </span>
  )
}

/** Renders the full status presentation for a link: primary status + optional lock. */
export function LinkStatusBadges({
  link,
  now,
  className,
}: {
  link: LinkResource
  now?: number
  className?: string
}) {
  const status = presentationStatus(link, now)
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <StatusBadge status={status} />
      {link.hasPassword && <ProtectedBadge />}
    </span>
  )
}
