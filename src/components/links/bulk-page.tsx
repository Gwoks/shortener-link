'use client'

/**
 * Bulk shortening controller (DESIGN §5.6, USER-JOURNEY Journey D, FR-24/25/26,
 * NFR-4, AC-31/32/33/34). A mono textarea (one URL per line) with a live counter
 * and the max-URL limit surfaced; submit POSTs the whole batch to /api/links/bulk
 * (one rate-limit charge per batch) and renders a per-row results table with
 * partial-success semantics — successful rows show the short link + a per-row copy
 * button, failed/blocked rows show a clear per-row reason. Header actions on the
 * results: copy-all (newline-joined short links) and CSV export of the batch.
 *
 * The per-batch limit (A-BULK, default 100) is enforced authoritatively by the
 * server (413 BULK_LIMIT_EXCEEDED); we surface it client-side too so the user is
 * warned before submitting (AC-34) and we never POST an over-limit batch.
 */
import { ListChecks, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { PageHeader } from '../app/app-shell'
import { api, ApiError } from '../lib/api'
import type { BulkResultRow } from '../lib/types'
import { Button } from '../ui/button'
import { Textarea } from '../ui/input'
import { useToast } from '../ui/toast'
import { BulkResults } from './bulk-results'

/**
 * Frontend mirror of the backend default per-batch cap (A-BULK, src/lib/env.ts
 * BULK_MAX). Kept as a constant because the limit is a stable product decision;
 * the server stays authoritative and a deployment override is still handled
 * gracefully via the BULK_LIMIT_EXCEEDED error path below.
 */
export const BULK_MAX = 100

/** Split the textarea into trimmed, non-empty candidate URLs (one per line). */
export function parseUrlLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'done'; results: BulkResultRow[]; submittedAt: number }
  | { phase: 'error'; message: string }

export function BulkPage() {
  const { success, error } = useToast()
  const [text, setText] = useState('')
  const [state, setState] = useState<RunState>({ phase: 'idle' })
  // Monotonic token so a slow batch can't overwrite a newer run.
  const reqId = useRef(0)

  const urls = useMemo(() => parseUrlLines(text), [text])
  const count = urls.length
  const overLimit = count > BULK_MAX
  const empty = count === 0
  const submitting = state.phase === 'submitting'

  const run = useCallback(async () => {
    if (submitting) return
    if (empty) {
      error('Nothing to shorten', 'Paste at least one URL — one per line.')
      return
    }
    if (overLimit) {
      error('Too many URLs', `Submit at most ${BULK_MAX} URLs at a time.`)
      return
    }
    const id = ++reqId.current
    setState({ phase: 'submitting' })
    try {
      const res = await api.bulk(urls)
      if (id !== reqId.current) return
      setState({ phase: 'done', results: res.results, submittedAt: Date.now() })
      const okCount = res.results.filter((r) => r.ok).length
      const failCount = res.results.length - okCount
      if (failCount === 0) {
        success('Batch shortened', `${okCount} of ${res.results.length} links created.`)
      } else {
        // Partial success is the norm (AC-31/32) — report, don't treat as failure.
        success(
          'Batch processed',
          `${okCount} succeeded, ${failCount} need attention — see the results below.`,
        )
      }
    } catch (e) {
      if (id !== reqId.current) return
      const message =
        e instanceof ApiError
          ? e.message
          : 'We couldn’t reach the server. Check your connection and try again.'
      setState({ phase: 'error', message })
      error('Couldn’t shorten the batch', message)
    }
  }, [submitting, empty, overLimit, urls, success, error])

  const clearAll = useCallback(() => {
    setText('')
    setState({ phase: 'idle' })
    reqId.current++
  }, [])

  const counterId = 'bulk-url-counter'
  const limitMsgId = 'bulk-limit-message'

  return (
    <div>
      <PageHeader
        title="Bulk shorten"
        description="Paste many URLs at once — one per line — and shorten the whole batch."
      />

      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* ── Input panel ── */}
        <section className="rounded-md border border-border bg-surface p-5 sm:p-6" aria-label="Bulk input">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="bulk-urls" className="text-body-sm font-medium text-text-primary">
              Paste URLs — one per line
            </label>
            <span
              id={counterId}
              aria-live="polite"
              className={
                overLimit
                  ? 'tnum text-caption font-medium text-danger-fg'
                  : 'tnum text-caption font-medium text-text-tertiary'
              }
            >
              {count} / {BULK_MAX} URLs
            </span>
          </div>

          <Textarea
            id="bulk-urls"
            mono
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            invalid={overLimit}
            aria-describedby={`${counterId}${overLimit ? ` ${limitMsgId}` : ''}`}
            placeholder={'https://example.com/very/long/path\nhttps://another.example.com/page\nhttps://third.example.com/'}
            rows={8}
            className="min-h-[12rem] resize-y leading-6"
            spellCheck={false}
          />

          {overLimit && (
            <p id={limitMsgId} role="alert" className="mt-2 text-body-sm text-danger-fg">
              That’s {count} URLs — the limit is {BULK_MAX} per batch. Remove {count - BULK_MAX} to
              continue.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" onClick={run} loading={submitting} disabled={empty || overLimit}>
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Shortening…' : 'Shorten all'}
            </Button>
            {text.length > 0 && (
              <Button type="button" variant="ghost" onClick={clearAll} disabled={submitting}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            )}
            <p className="text-caption text-text-tertiary sm:ml-auto">
              The whole batch counts as one shorten request.
            </p>
          </div>
        </section>

        {/* ── Results / states ── */}
        {state.phase === 'submitting' && (
          <div role="status" className="rounded-md border border-border bg-surface px-6 py-12 text-center">
            <span className="sr-only">Shortening your batch…</span>
            <p className="text-body-sm text-text-secondary" aria-hidden="true">
              Shortening {count} {count === 1 ? 'URL' : 'URLs'}…
            </p>
          </div>
        )}

        {state.phase === 'error' && (
          <div
            role="alert"
            className="rounded-md border border-border bg-danger-bg/40 px-6 py-10 text-center"
          >
            <h3 className="text-h4 text-text-primary">Couldn’t shorten the batch</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-body-sm text-text-secondary">{state.message}</p>
            <Button type="button" variant="secondary" className="mt-5" onClick={run}>
              Try again
            </Button>
          </div>
        )}

        {state.phase === 'done' && <BulkResults results={state.results} />}
      </div>
    </div>
  )
}
