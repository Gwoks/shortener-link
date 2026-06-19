'use client'

/**
 * Mobile stacked card (DESIGN §4.5/§5.4, NFR-17, AC-51). The table degrades to
 * these cards below the table breakpoint — never a horizontal scroll. Line 1:
 * short code (mono, prominent) + status badge. Line 2: truncated destination
 * (full on tap/focus via title). Footer: click count + relative date + copy +
 * kebab. The whole card links to per-link analytics; inner controls stop
 * propagation.
 */
import { ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { absoluteTime, displayDestination, formatNumber, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { LinkStatusBadges } from '../ui/status-badge'
import { CopyButton } from './copy-button'
import { LinkRowActions } from './link-row-actions'

export function LinkCard({
  link,
  onDelete,
}: {
  link: LinkResource
  onDelete: (link: LinkResource) => void
}) {
  const navigate = useNavigate()
  const analyticsHref = `/dashboard/links/${link.id}/analytics`

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${link.shortUrl}, ${formatNumber(link.clickCount)} clicks`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button,[role="menuitem"]')) return
        navigate(analyticsHref)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(analyticsHref)
        }
      }}
      className="cursor-pointer rounded-md border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm font-mono text-body font-medium text-text-primary hover:text-accent"
        >
          <span className="truncate">/{link.code}</span>
          <ExternalLink className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <LinkStatusBadges link={link} className="shrink-0" />
      </div>

      {link.metaTitle && (
        <p className="mt-2 truncate text-body-sm text-text-primary" title={link.metaTitle}>
          {link.metaTitle}
        </p>
      )}
      <p
        className="mt-1 truncate font-mono text-caption text-text-tertiary"
        title={link.destinationUrl}
      >
        {displayDestination(link.destinationUrl)}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-3 text-caption text-text-secondary">
          <span className="tnum font-medium text-text-primary">
            {formatNumber(link.clickCount)} <span className="font-normal text-text-tertiary">clicks</span>
          </span>
          <span aria-hidden="true">·</span>
          <span title={absoluteTime(link.createdAt)}>{relativeTime(link.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton value={link.shortUrl} variant="ghost" aria-label={`Copy ${link.shortUrl}`} />
          <LinkRowActions link={link} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
