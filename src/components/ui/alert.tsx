/**
 * Inline, persistent alert (rate-limit, blocklist, validation summaries).
 * Always icon + text so meaning never relies on color alone.
 */
import { AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type AlertTone = 'danger' | 'warning' | 'info'

const TONE: Record<AlertTone, { icon: LucideIcon; cls: string }> = {
  danger: { icon: AlertTriangle, cls: 'bg-danger-bg text-danger-fg' },
  warning: { icon: AlertTriangle, cls: 'bg-warning-bg text-warning-fg' },
  info: { icon: Info, cls: 'bg-sky-tint text-accent' },
}

export interface InlineAlertProps {
  tone?: AlertTone
  children: ReactNode
  className?: string
  /** For aria-describedby wiring from a form control. */
  id?: string
}

export function InlineAlert({ tone = 'danger', children, className, id }: InlineAlertProps) {
  const { icon: Icon, cls } = TONE[tone]
  return (
    <div
      id={id}
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('flex items-start gap-2 rounded-sm px-3 py-2.5 text-body-sm', cls, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
