/**
 * Authenticated app shell: skip link → 64px TopNav → centered content column
 * (DESIGN.md §Layout). Each page renders its own <PageHeader> first.
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { TopNav } from './top-nav'

const SKIP_TARGET_ID = 'app-main-content'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <a
        href={`#${SKIP_TARGET_ID}`}
        className="sr-only rounded-sm bg-surface px-4 py-2 text-body-sm font-medium text-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast"
      >
        Skip to content
      </a>
      <TopNav variant="app" />
      <main
        id={SKIP_TARGET_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-content px-4 py-8 outline-none sm:px-6 sm:py-12"
      >
        {children}
      </main>
    </div>
  )
}

/**
 * Page header — editorial title (+ optional description) on the left,
 * contextual actions on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-heading-sm text-text-primary md:text-heading">{title}</h1>
        {description && <p className="mt-2 text-body text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
