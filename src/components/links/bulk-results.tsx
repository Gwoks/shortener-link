'use client'

/**
 * Bulk results table (DESIGN §5.6, FR-25/26, AC-31/32/33). One row per input with
 * partial-success semantics: successful rows show the short link + a per-row copy
 * button, failed/blocked rows show a clear per-row reason. Failures are visually
 * distinct from successes via icon + label + row tint (never color alone, AC-32).
 * Header actions: copy-all (newline-joined short links) and CSV export of the
 * whole batch (AC-33). A summary line announces the success/failure split.
 *
 * Desktop renders a real <table> (semantic headers); mobile degrades to stacked
 * cards so long URLs truncate and the page never scrolls horizontally (NFR-17).
 */
import { CheckCircle2, Copy, Download, ExternalLink, XCircle } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { displayDestination } from '../lib/format'
import type { BulkResultRow } from '../lib/types'
import { Button } from '../ui/button'
import { useToast } from '../ui/toast'
import { CopyButton } from './copy-button'

/** Map an error row to a short, human reason chip label. */
function reasonLabel(row: BulkResultRow): string {
  return row.error?.message ?? 'Couldn’t shorten this URL.'
}

/** Build a CSV (input, short_url, status, reason) for the whole batch (AC-33). */
export function buildCsv(results: BulkResultRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const header = ['input', 'short_url', 'status', 'reason'].join(',')
  const lines = results.map((r) =>
    [
      esc(r.input),
      esc(r.ok ? r.link?.shortUrl ?? '' : ''),
      esc(r.ok ? 'success' : 'failed'),
      esc(r.ok ? '' : reasonLabel(r)),
    ].join(','),
  )
  return [header, ...lines].join('\r\n')
}

/** Newline-joined short links for the successful rows (copy-all). */
export function successUrls(results: BulkResultRow[]): string[] {
  return results.filter((r) => r.ok && r.link?.shortUrl).map((r) => r.link!.shortUrl)
}

function StatusCell({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-bg px-2 py-0.5 text-caption font-medium text-success-fg">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Success
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-bg px-2 py-0.5 text-caption font-medium text-danger-fg">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Failed
    </span>
  )
}

function ResultValue({ row }: { row: BulkResultRow }) {
  if (row.ok && row.link) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <a
          href={row.link.shortUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-sm font-mono text-body-sm font-medium text-text-primary hover:text-accent"
          title={row.link.shortUrl}
        >
          <span className="truncate">{displayDestination(row.link.shortUrl)}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <CopyButton
          value={row.link.shortUrl}
          variant="ghost"
          toastTitle="Short link copied!"
          aria-label={`Copy ${row.link.shortUrl}`}
        />
      </div>
    )
  }
  return <span className="text-body-sm text-danger-fg">{reasonLabel(row)}</span>
}

export function BulkResults({ results }: { results: BulkResultRow[] }) {
  const { success, error } = useToast()
  const [copiedAll, setCopiedAll] = useState(false)

  const okCount = useMemo(() => results.filter((r) => r.ok).length, [results])
  const failCount = results.length - okCount
  const urls = useMemo(() => successUrls(results), [results])

  const onCopyAll = useCallback(async () => {
    if (urls.length === 0) {
      error('Nothing to copy', 'No links were created in this batch.')
      return
    }
    const text = urls.join('\n')
    let ok = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        ok = true
      }
    } catch {
      /* fall through to legacy path */
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.top = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (!ok) {
      error('Couldn’t copy', 'Select the links and copy them manually.')
      return
    }
    success('All links copied!', `${urls.length} short ${urls.length === 1 ? 'link' : 'links'} copied.`)
    setCopiedAll(true)
    window.setTimeout(() => setCopiedAll(false), 2000)
  }, [urls, success, error])

  const onExportCsv = useCallback(() => {
    const csv = buildCsv(results)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `bulk-links-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    success('CSV exported', `${results.length} rows saved.`)
  }, [results, success])

  return (
    <section aria-label="Bulk results" className="space-y-3">
      {/* Header: summary + batch actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-h4 text-text-primary">Results</h3>
          <p className="mt-0.5 text-body-sm text-text-secondary" role="status">
            {okCount} succeeded
            {failCount > 0 ? `, ${failCount} failed` : ''} · {results.length} total
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCopyAll} disabled={urls.length === 0}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copiedAll ? 'Copied!' : 'Copy all'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onExportCsv}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
          <span className="sr-only" aria-live="polite">
            {copiedAll ? 'All links copied to clipboard' : ''}
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-border bg-surface-subtle">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
                Input URL
              </th>
              <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
                Result
              </th>
              <th scope="col" className="px-3 py-2.5 text-overline uppercase text-text-tertiary">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <tr
                key={`${row.input}-${i}`}
                className={cn(
                  'border-b border-border last:border-b-0',
                  row.ok ? '' : 'bg-danger-bg/30',
                )}
              >
                <td className="max-w-[1px] px-3 py-3 align-middle">
                  <span
                    className="block truncate font-mono text-body-sm text-text-secondary"
                    title={row.input}
                  >
                    {displayDestination(row.input)}
                  </span>
                </td>
                <td className="max-w-[1px] px-3 py-3 align-middle">
                  <ResultValue row={row} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-middle">
                  <StatusCell ok={row.ok} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="space-y-3 md:hidden">
        {results.map((row, i) => (
          <li
            key={`${row.input}-${i}`}
            className={cn(
              'rounded-md border border-border bg-surface p-4',
              row.ok ? '' : 'border-danger-fg/30 bg-danger-bg/30',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-overline uppercase text-text-tertiary">Input</span>
              <StatusCell ok={row.ok} />
            </div>
            <p className="mt-1 truncate font-mono text-body-sm text-text-secondary" title={row.input}>
              {displayDestination(row.input)}
            </p>
            <div className="mt-3 border-t border-border pt-3">
              <span className="text-overline uppercase text-text-tertiary">Result</span>
              <div className="mt-1">
                <ResultValue row={row} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
