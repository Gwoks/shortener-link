/**
 * Placeholder section for routes whose full screens land in later pipeline
 * slices (create/edit, bulk, analytics, settings). Keeps the authenticated nav
 * fully navigable now — no dead 404s inside the shell — while clearly signalling
 * the screen is not yet built. Uses the same tokens as real screens.
 */
import { Link } from 'react-router-dom'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { PageHeader } from './app-shell'

export function ComingSoon({
  title,
  description,
  icon: Icon,
  backHref = '/dashboard',
  backLabel = 'Back to links',
}: {
  title: string
  description: string
  icon: LucideIcon
  backHref?: string
  backLabel?: string
}) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-6 py-16 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-subtle text-text-tertiary">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="text-h4 text-text-primary">{title} is coming soon</h3>
        <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{description}</p>
        <Link
          to={backHref}
          className="mt-5 inline-flex items-center gap-1.5 rounded-sm text-body-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
