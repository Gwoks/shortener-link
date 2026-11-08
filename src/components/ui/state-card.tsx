/**
 * Centered state block for empty / error / info outcomes — icon badge, title,
 * explanation, and recovery actions on a white Card. Replaces the hand-built
 * error and empty blocks that were repeated across pages.
 */
import { AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Card } from './card'

type StateTone = 'error' | 'empty' | 'info'

const TONE: Record<StateTone, { icon: LucideIcon; badge: string; role?: 'alert' | 'status' }> = {
  error: { icon: AlertTriangle, badge: 'bg-danger-bg text-danger-fg', role: 'alert' },
  empty: { icon: Info, badge: 'bg-sky-tint text-accent' },
  info: { icon: Info, badge: 'bg-sky-tint text-accent', role: 'status' },
}

export interface StateCardProps {
  tone?: StateTone
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function StateCard({
  tone = 'empty',
  icon,
  title,
  description,
  actions,
  className,
}: StateCardProps) {
  const config = TONE[tone]
  const Icon = icon ?? config.icon
  return (
    <Card
      role={config.role}
      padding="none"
      className={cn('flex flex-col items-center px-6 py-16 text-center', className)}
    >
      <span
        className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-pill', config.badge)}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-title text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{description}</p>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </Card>
  )
}
