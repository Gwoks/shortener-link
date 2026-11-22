/**
 * Building blocks shared by the per-link pages (edit + analytics): the back
 * link, the load-error state, and the link summary card.
 */
import { ArrowLeft, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, isNotFound } from '../lib/api'
import { absoluteTime, displayDestination, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { StateCard } from '../ui/state-card'
import { LinkStatusBadges } from '../ui/status-badge'

export function BackLink({ to = '/dashboard', label = 'Links' }: { to?: string; label?: string }) {
  return (
    <Link
      to={to}
      className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-body-sm text-text-secondary transition-colors duration-base hover:text-text-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}

/** Not-found / forbidden / transient failure while loading a single link. */
export function LinkLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = isNotFound(error)
  return (
    <StateCard
      tone="error"
      className="mx-auto w-full max-w-form"
      title={notFound ? 'Link not found' : 'Couldn’t load this link'}
      description={
        notFound
          ? 'This link doesn’t exist, or you don’t have access to it.'
          : errorMessage(error, 'We couldn’t load this link. Try again.')
      }
      actions={
        <>
          {!notFound && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button asChild variant={notFound ? 'primary' : 'ghost'}>
            <Link to="/dashboard">Back to links</Link>
          </Button>
        </>
      }
    />
  )
}

function ExpiryNote({ expiresAt }: { expiresAt: string }) {
  const isPast = new Date(expiresAt).getTime() <= Date.now()
  return (
    <span title={absoluteTime(expiresAt)}>
      {' · '}
      {isPast ? 'expired' : 'expires'} {relativeTime(expiresAt)}
    </span>
  )
}

/** Short URL + status, destination, and lifecycle facts for one link. */
export function LinkSummaryCard({
  link,
  className,
  children,
}: {
  link: LinkResource
  className?: string
  children?: ReactNode
}) {
  return (
    <Card padding="sm" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-body font-medium text-text-primary transition-colors duration-base hover:text-accent"
        >
          {link.shortUrl}
        </a>
        <LinkStatusBadges link={link} />
      </div>
      <p
        className="mt-1.5 truncate font-mono text-caption text-text-tertiary"
        title={link.destinationUrl}
      >
        {displayDestination(link.destinationUrl)}
      </p>
      <p className="mt-1 text-caption text-text-tertiary">
        <span title={absoluteTime(link.createdAt)}>Created {relativeTime(link.createdAt)}</span>
        {link.expiresAt && <ExpiryNote expiresAt={link.expiresAt} />}
        {link.hasPassword && (
          <span className="ml-1 inline-flex items-center gap-1">
            <span aria-hidden="true">·</span>
            <Lock className="h-3 w-3" aria-hidden="true" /> Password-protected
          </span>
        )}
      </p>
      {children}
    </Card>
  )
}
