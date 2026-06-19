'use client'

/**
 * Create-success result (DESIGN §5.5 success state, USER-JOURNEY §4.3 "Success",
 * FR-12/14/42, AC-47). After a link is created we don't just navigate away — we
 * confirm with a result card: the short link in mono with a copy button, an
 * inline QR thumbnail (opens the full QR modal, §5.9), the destination, and the
 * link's status (metadata begins as pending). Primary actions let the user create
 * another or jump to the dashboard.
 */
import { CheckCircle2, ExternalLink, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { qrUrlForId } from '../lib/api'
import { displayDestination } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { LinkStatusBadges } from '../ui/status-badge'
import { CopyButton } from './copy-button'
import { QrModal } from './qr-modal'

export function LinkResultCard({
  link,
  onCreateAnother,
}: {
  link: LinkResource
  onCreateAnother: () => void
}) {
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-2 text-success-fg">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-h4 text-text-primary">Your short link is ready</h2>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Inline QR thumbnail — opens the full modal. */}
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Open QR code"
          className="mx-auto shrink-0 rounded-md border border-border bg-white p-2 transition-colors hover:border-accent sm:mx-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API-rendered PNG */}
          <img
            src={qrUrlForId(link.id, 'sm')}
            alt={`QR code linking to ${link.shortUrl}`}
            width={96}
            height={96}
            className="h-24 w-24 object-contain"
          />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <span className="text-caption font-medium text-text-secondary">Short link</span>
            <div className="mt-1 flex items-center gap-2 rounded-sm border border-border bg-surface-subtle px-3 py-2">
              <a
                href={link.shortUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-mono text-body-sm font-medium text-text-primary hover:text-accent"
                title={link.shortUrl}
              >
                <span className="truncate">{link.shortUrl}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <CopyButton
                value={link.shortUrl}
                label="Copy"
                toastTitle="Short link copied!"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LinkStatusBadges link={link} />
          </div>

          <p className="truncate font-mono text-caption text-text-tertiary" title={link.destinationUrl}>
            {displayDestination(link.destinationUrl)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" onClick={onCreateAnother}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create another
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/dashboard/links/${link.id}`}>Edit this link</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Back to links</Link>
        </Button>
      </div>

      <QrModal
        open={qrOpen}
        onOpenChange={setQrOpen}
        shortUrl={link.shortUrl}
        code={link.code}
        linkId={link.id}
      />
    </div>
  )
}
