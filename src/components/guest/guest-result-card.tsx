'use client'

/**
 * Guest result card (DESIGN §5.2, USER-JOURNEY Journey A / §4.2, FR-45, FR-12,
 * FR-14, FR-42, AC-40, AC-47). The output of a guest shorten: the short link in
 * mono with a copy button (+ toast, copied-state, clipboard fallback — all from
 * the shared CopyButton), an inline QR thumbnail that opens the full QR modal
 * (§5.9), an explicit "expires in 24h" notice with a live relative countdown, the
 * guest-tier note (only a basic click count is available, FR-10), and a single
 * quiet, dismissible sign-up upsell line (non-nagging, FR-45).
 *
 * Shares tokens + the reusable CopyButton / QrModal / status badges with the
 * dashboard so a guest feels they've used a slice of the real product (FR-45).
 * It intentionally does NOT link into the protected dashboard (a guest has no
 * session) — the only conversion path is the sign-up line.
 */
import { Clock, ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { qrUrlForCode } from '../lib/api'
import { absoluteTime, displayDestination, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { LinkStatusBadges } from '../ui/status-badge'
import { CopyButton } from '../links/copy-button'
import { QrModal } from '../links/qr-modal'

export function GuestResultCard({
  link,
  onDismiss,
}: {
  link: LinkResource
  /** Remove this card from the stack ("Done"). */
  onDismiss?: () => void
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the new card and announce it (DESIGN §5.1 "focus moved to it").
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const expiresLabel = link.expiresAt ? relativeTime(link.expiresAt) : 'in 24 hours'

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-h4 text-text-primary outline-none"
        >
          Your short link
        </h2>
        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            aria-label="Dismiss this short link"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {/* Big short link in mono + copy. */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-subtle px-3 py-2.5">
            <a
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-mono text-mono-lg font-medium text-text-primary hover:text-accent"
              title={link.shortUrl}
            >
              <span className="truncate">{link.shortUrl}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <CopyButton value={link.shortUrl} label="Copy link" toastTitle="Link copied!" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LinkStatusBadges link={link} />
          </div>

          {/* Destination (mono, truncated). */}
          <p className="truncate font-mono text-caption text-text-tertiary" title={link.destinationUrl}>
            {displayDestination(link.destinationUrl)}
          </p>
        </div>

        {/* Inline QR thumbnail — opens the full modal (§5.9). */}
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Show QR code"
          className="mx-auto shrink-0 rounded-md border border-border bg-white p-2 transition-colors hover:border-accent sm:mx-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API-rendered PNG */}
          <img
            src={qrUrlForCode(link.code, 'sm')}
            alt={`QR code linking to ${link.shortUrl}`}
            width={96}
            height={96}
            className="h-24 w-24 object-contain"
          />
        </button>
      </div>

      {/* TTL + guest-tier note (FR-10, AC-40). */}
      <p className="mt-4 flex items-center gap-1.5 text-caption text-text-secondary">
        <Clock className="h-3.5 w-3.5 shrink-0 text-warning-fg" aria-hidden="true" />
        <span>
          Expires <time dateTime={link.expiresAt ?? undefined} title={link.expiresAt ? absoluteTime(link.expiresAt) : undefined}>{expiresLabel}</time>
          {' · '}only a basic click count is available for guest links.
        </span>
      </p>

      <hr className="my-4 border-border" />

      {/* Single quiet sign-up upsell (non-nagging, FR-45, AC-40). */}
      <p className="text-body-sm text-text-secondary">
        Want it permanent with full analytics?{' '}
        <Link
          to="/signin?mode=signup"
          className="rounded-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign up
        </Link>{' '}
        — keeps this link and unlocks QR downloads, custom aliases, and analytics.
      </p>

      <QrModal open={qrOpen} onOpenChange={setQrOpen} shortUrl={link.shortUrl} code={link.code} />
    </div>
  )
}
