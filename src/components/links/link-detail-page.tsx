'use client'

/**
 * Link detail / edit controller (DESIGN §5.5, USER-JOURNEY §4.3). Loads the link
 * by id via the typed api client, then renders the shared LinkForm in "edit" mode
 * (destination, expiry, max-clicks, password, active toggle). Honors the `?qr=1`
 * query param from the list's row action by auto-opening the QR modal (§5.9), and
 * offers Copy/QR header actions. Covers loading, error, not-found, and forbidden.
 */
import { AlertTriangle, ArrowLeft, BarChart3, Lock, QrCode } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../app/app-shell'
import { api, ApiError } from '../lib/api'
import { absoluteTime, displayDestination, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { SkeletonLines } from '../ui/skeleton'
import { LinkStatusBadges } from '../ui/status-badge'
import { CopyButton } from './copy-button'
import { LinkForm } from './link-form'
import { QrModal } from './qr-modal'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; notFound?: boolean }
  | { phase: 'ready'; link: LinkResource }

export function LinkDetailPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [qrOpen, setQrOpen] = useState(false)
  // Only auto-open the QR modal once per mount (from the ?qr=1 deep link).
  const autoOpened = useRef(false)

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const res = await api.getLink(id)
      setState({ phase: 'ready', link: res.link })
    } catch (e) {
      if (e instanceof ApiError) {
        const notFound = e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN'
        setState({
          phase: 'error',
          notFound,
          message: notFound
            ? 'This link doesn’t exist, or you don’t have access to it.'
            : e.message,
        })
      } else {
        setState({ phase: 'error', message: 'We couldn’t load this link. Try again.' })
      }
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-open QR from ?qr=1 once the link is loaded.
  useEffect(() => {
    if (state.phase === 'ready' && !autoOpened.current && searchParams.get('qr') === '1') {
      autoOpened.current = true
      setQrOpen(true)
    }
  }, [state, searchParams])

  // ── Loading ──
  if (state.phase === 'loading') {
    return (
      <div>
        <BackLink />
        <PageHeader title="Edit link" />
        <div className="mx-auto w-full max-w-2xl rounded-md border border-border bg-surface p-6">
          <span className="sr-only" role="status">
            Loading link…
          </span>
          <SkeletonLines lines={6} />
        </div>
      </div>
    )
  }

  // ── Error / not found ──
  if (state.phase === 'error') {
    return (
      <div>
        <BackLink />
        <PageHeader title="Edit link" />
        <div
          role="alert"
          className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center rounded-md border border-border bg-surface px-6 py-16 text-center"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="text-h4 text-text-primary">
            {state.notFound ? 'Link not found' : 'Couldn’t load this link'}
          </h3>
          <p className="mt-1.5 max-w-sm text-body-sm text-text-secondary">{state.message}</p>
          <div className="mt-5 flex gap-2">
            {!state.notFound && (
              <Button variant="secondary" onClick={() => load()}>
                Try again
              </Button>
            )}
            <Button asChild variant={state.notFound ? 'primary' : 'ghost'}>
              <Link to="/dashboard">Back to links</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Ready ──
  const link = state.link

  return (
    <div>
      <BackLink />
      <PageHeader
        title="Edit link"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={link.shortUrl} label="Copy" toastTitle="Short link copied!" />
            <Button variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              QR code
            </Button>
            <Button asChild variant="secondary">
              <Link to={`/dashboard/links/${link.id}/analytics`}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Analytics
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* Context summary */}
        <div className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-body font-medium text-text-primary hover:text-accent"
            >
              {link.shortUrl}
            </a>
            <LinkStatusBadges link={link} />
          </div>
          <p className="mt-1.5 truncate font-mono text-caption text-text-tertiary" title={link.destinationUrl}>
            {displayDestination(link.destinationUrl)}
          </p>
          <p className="mt-1 text-caption text-text-tertiary">
            <span title={absoluteTime(link.createdAt)}>Created {relativeTime(link.createdAt)}</span>
            {link.hasPassword && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span aria-hidden="true">·</span>
                <Lock className="h-3 w-3" aria-hidden="true" /> Password-protected
              </span>
            )}
          </p>
        </div>

        {/* Edit form */}
        <div className="rounded-md border border-border bg-surface p-5 sm:p-6">
          <LinkForm
            mode="edit"
            link={link}
            onUpdated={() => navigate('/dashboard')}
            onCancel={() => navigate('/dashboard')}
          />
        </div>
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

function BackLink() {
  return (
    <div className="mb-2">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-sm text-body-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Links
      </Link>
    </div>
  )
}
