'use client'

/**
 * Desktop links table (DESIGN §4.5/§5.4, FR-28). Sticky header with sortable
 * Clicks/Created columns (the two orderings the API supports, §6.2). Columns:
 * Link (mono code + open-in-new), Destination (mono, truncated, full on
 * hover/focus via title), Status (icon+text badge + lock), Clicks (tabular),
 * Created (relative + absolute on hover), Actions (kebab). Each row is a
 * keyboard-focusable link to per-link analytics (Enter opens it).
 */
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '../lib/cn'
import { absoluteTime, displayDestination, formatNumber, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { LinkStatusBadges } from '../ui/status-badge'
import { CopyButton } from './copy-button'
import { LinkRowActions } from './link-row-actions'
import type { SortKey, SortOrder } from './links-query'

function SortHeader({
  label,
  active,
  order,
  onSort,
  className,
}: {
  label: string
  active: boolean
  order: SortOrder
  onSort: () => void
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" className={cn('px-3 py-2.5', className)} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm text-overline uppercase transition-colors',
          active ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  )
}

export function LinksTable({
  links,
  sort,
  order,
  onSortChange,
  onDelete,
}: {
  links: LinkResource[]
  sort: SortKey
  order: SortOrder
  onSortChange: (sort: SortKey) => void
  onDelete: (link: LinkResource) => void
}) {
  const router = useRouter()

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-header z-sticky border-b border-border bg-surface-subtle">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
              Link
            </th>
            <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
              Destination
            </th>
            <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
              Status
            </th>
            <SortHeader
              label="Clicks"
              active={sort === 'clicks'}
              order={order}
              onSort={() => onSortChange('clicks')}
              className="text-right"
            />
            <SortHeader
              label="Created"
              active={sort === 'created'}
              order={order}
              onSort={() => onSortChange('created')}
            />
            <th scope="col" className="px-3 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => {
            const analyticsHref = `/dashboard/links/${link.id}/analytics`
            return (
              <tr
                key={link.id}
                tabIndex={0}
                onClick={(e) => {
                  // Ignore clicks that originate from interactive controls in the row.
                  if ((e.target as HTMLElement).closest('a,button,[role="menuitem"]')) return
                  router.push(analyticsHref)
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    router.push(analyticsHref)
                  }
                }}
                className="group cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
              >
                {/* Link */}
                <td className="px-3 py-3 align-middle">
                  <a
                    href={link.shortUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-sm font-mono text-body-sm font-medium text-text-primary hover:text-accent"
                    title={link.shortUrl}
                  >
                    /{link.code}
                    <ExternalLink className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </td>

                {/* Destination */}
                <td className="max-w-[1px] px-3 py-3 align-middle">
                  {link.metaTitle ? (
                    <div className="min-w-0">
                      <div className="truncate text-body-sm text-text-primary" title={link.metaTitle}>
                        {link.metaTitle}
                      </div>
                      <div
                        className="truncate font-mono text-caption text-text-tertiary"
                        title={link.destinationUrl}
                      >
                        {displayDestination(link.destinationUrl)}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="truncate font-mono text-body-sm text-text-secondary"
                      title={link.destinationUrl}
                    >
                      {displayDestination(link.destinationUrl)}
                    </div>
                  )}
                </td>

                {/* Status */}
                <td className="px-3 py-3 align-middle">
                  <LinkStatusBadges link={link} />
                </td>

                {/* Clicks */}
                <td className="px-3 py-3 text-right align-middle">
                  <span className="tnum text-body-sm font-medium text-text-primary">
                    {formatNumber(link.clickCount)}
                  </span>
                </td>

                {/* Created */}
                <td className="whitespace-nowrap px-3 py-3 align-middle">
                  <span className="text-body-sm text-text-secondary" title={absoluteTime(link.createdAt)}>
                    {relativeTime(link.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <CopyButton value={link.shortUrl} variant="ghost" aria-label={`Copy ${link.shortUrl}`} />
                    <LinkRowActions link={link} onDelete={onDelete} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
