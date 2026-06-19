'use client'

/**
 * Guest landing hero (DESIGN §5.1, USER-JOURNEY Journey A / §4.1, FR-32/45/5/35/
 * 36, AC-40/43/44). A focused, single-purpose hero (A-LANDING): paste a long URL
 * → Shorten. On submit we create a guest link via the typed API client (24h TTL,
 * server-minted guest cookie) and render a GuestResultCard below; multiple links
 * created in a session stack most-recent-first (§5.2).
 *
 * Error handling is recovery-oriented, never a bare code (FR-37):
 *  - invalid URL  → inline field error under the input (client + server, AC-7)
 *  - rate-limited → inline alert with the retry-after window (AC-43)
 *  - blocked URL  → inline alert, non-accusatory, with a next step (AC-44)
 *
 * An optional "advanced" disclosure exposes an at-creation expiry affordance even
 * for guests (FR-32) — a shorter expiry within the 24h guest window.
 */
import { AlertTriangle, ChevronDown, Link2 } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { localInputToIso, nowLocalInput } from '../lib/format'
import type { CreateLinkPayload, LinkResource } from '../lib/types'
import { isValidHttpUrl } from '../lib/url-check'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { GuestResultCard } from './guest-result-card'

/** Inline, persistent alert for rate-limit / blocklist explanations (DESIGN §4.9). */
function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-sm border border-danger-fg/40 bg-danger-bg px-3 py-2.5 text-body-sm text-danger-fg"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function GuestHero() {
  const [url, setUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Field-level error (invalid URL) vs a persistent banner-style alert
  // (rate-limit / blocklist) that needs to stay visible (FR-35/36).
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [alert, setAlert] = useState<React.ReactNode>(null)

  // Created guest links, most-recent-first (§5.2 "stack as a short list").
  const [results, setResults] = useState<LinkResource[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const fieldErrId = useId()
  const helperId = useId()
  const advancedId = useId()

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setFieldError(null)
      setAlert(null)

      const trimmed = url.trim()
      if (!trimmed) {
        setFieldError('Paste a URL to shorten.')
        inputRef.current?.focus()
        return
      }
      if (trimmed.length > 2048) {
        setFieldError('That URL is too long.')
        inputRef.current?.focus()
        return
      }
      if (!isValidHttpUrl(trimmed)) {
        setFieldError('That doesn’t look like a valid web address. Use a full http(s):// URL.')
        inputRef.current?.focus()
        return
      }

      // Validate the optional expiry (must be in the future).
      let isoExpiry: string | null = null
      if (expiresAt) {
        isoExpiry = localInputToIso(expiresAt)
        if (!isoExpiry || new Date(isoExpiry).getTime() <= Date.now()) {
          setAdvancedOpen(true)
          setFieldError(null)
          setAlert('Pick an expiry time in the future, or leave it blank for the default 24 hours.')
          return
        }
      }

      setSubmitting(true)
      try {
        const payload: CreateLinkPayload = { url: trimmed }
        if (isoExpiry) payload.expiresAt = isoExpiry
        const { link } = await api.createLink(payload)
        setResults((prev) => [link, ...prev])
        setUrl('')
        setExpiresAt('')
        setAdvancedOpen(false)
      } catch (err) {
        if (err instanceof ApiError) {
          switch (err.code) {
            case 'INVALID_URL':
            case 'VALIDATION_ERROR':
              setFieldError(err.message)
              inputRef.current?.focus()
              break
            case 'URL_BLOCKED':
              setAlert(err.message)
              break
            case 'RATE_LIMITED': {
              const wait = err.retryAfter
                ? ` Please try again in ${err.retryAfter} second${err.retryAfter === 1 ? '' : 's'}.`
                : ' Please wait a moment and try again.'
              setAlert(`You’ve shortened a lot of links in a short time.${wait}`)
              break
            }
            default:
              setAlert(err.message || 'Something went wrong. Please try again.')
          }
        } else {
          setAlert('Network error. Check your connection and try again.')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [url, expiresAt],
  )

  return (
    <section className="w-full">
      <div className="text-center">
        <h1 className="text-balance text-h1 font-bold text-text-primary sm:text-display">
          Shorten any link in seconds.
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-body text-text-secondary">
          Free, fast, and private. No account needed.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              aria-hidden="true"
            />
            <label htmlFor="guest-url" className="sr-only">
              Paste a long URL to shorten
            </label>
            <Input
              ref={inputRef}
              id="guest-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              autoFocus
              mono
              placeholder="Paste a long URL…"
              value={url}
              disabled={submitting}
              invalid={!!fieldError}
              aria-describedby={`${fieldError ? fieldErrId : ''} ${helperId}`.trim() || undefined}
              onChange={(e) => {
                setUrl(e.target.value)
                if (fieldError) setFieldError(null)
              }}
              className="h-11 pl-9 text-body"
            />
          </div>
          <Button type="submit" size="lg" loading={submitting} className="sm:w-auto sm:px-6">
            Shorten
          </Button>
        </div>

        {/* Inline field error (invalid URL) — announced via role=alert. */}
        {fieldError && (
          <p id={fieldErrId} role="alert" className="mt-2 text-body-sm text-danger-fg">
            {fieldError}
          </p>
        )}

        {/* Quiet helper that sets the 24h expectation up front (DESIGN §5.1). */}
        <p id={helperId} className="mt-2 text-body-sm text-text-tertiary">
          Links you create here expire in 24 hours.
        </p>

        {/* At-creation expiry affordance for guests (FR-32). */}
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls={advancedId}
            onClick={() => setAdvancedOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-sm text-body-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-fast ${advancedOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            Advanced
          </button>
          {advancedOpen && (
            <div id={advancedId} className="mt-3 rounded-md border border-border bg-surface p-4">
              <label htmlFor="guest-expiry" className="block text-body-sm font-medium text-text-primary">
                Expire sooner <span className="font-normal text-text-tertiary">(optional)</span>
              </label>
              <Input
                id="guest-expiry"
                type="datetime-local"
                min={nowLocalInput()}
                value={expiresAt}
                disabled={submitting}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-caption text-text-tertiary">
                Set a time within the next 24 hours. Leave blank to use the full 24-hour window.
              </p>
            </div>
          )}
        </div>

        {/* Persistent alert for rate-limit / blocklist (FR-35/36). */}
        {alert && (
          <div className="mt-4">
            <InlineAlert>{alert}</InlineAlert>
          </div>
        )}
      </form>

      {/* Result cards (most-recent-first). aria-live announces newly added links. */}
      {results.length > 0 && (
        <div className="mt-8 space-y-4" aria-live="polite">
          {results.map((link) => (
            <GuestResultCard
              key={link.id}
              link={link}
              onDismiss={() => setResults((prev) => prev.filter((l) => l.id !== link.id))}
            />
          ))}
        </div>
      )}
    </section>
  )
}
