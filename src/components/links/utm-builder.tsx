'use client'

/**
 * UTM builder (DESIGN §5.5 item 3, FR-22/23, AC-30). A collapsible group of the
 * five standard UTM fields plus a LIVE preview of the assembled destination URL
 * (the exact URL the short link will redirect to) rendered in mono. The preview
 * lets users verify campaign tagging *before* shortening (AC-30).
 *
 * The assembled URL mirrors the server's behavior: known utm_* params are merged
 * into the destination's query string (replacing any existing same-named param),
 * preserving the rest of the URL. Empty fields are omitted.
 */
import { ChevronDown, Tag } from 'lucide-react'
import { useId, useState } from 'react'
import type { UtmFields } from '../lib/types'
import { cn } from '../lib/cn'
import { Input, Label } from '../ui/input'

const UTM_FIELDS: Array<{ key: keyof UtmFields; label: string; param: string; placeholder: string }> = [
  { key: 'source', label: 'Source', param: 'utm_source', placeholder: 'newsletter' },
  { key: 'medium', label: 'Medium', param: 'utm_medium', placeholder: 'email' },
  { key: 'campaign', label: 'Campaign', param: 'utm_campaign', placeholder: 'spring_sale' },
  { key: 'term', label: 'Term', param: 'utm_term', placeholder: 'running+shoes' },
  { key: 'content', label: 'Content', param: 'utm_content', placeholder: 'logolink' },
]

const PARAM_BY_KEY: Record<keyof UtmFields, string> = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
}

/** True if any UTM field has a non-empty value. */
export function hasUtm(utm: UtmFields): boolean {
  return Object.values(utm).some((v) => (v ?? '').trim().length > 0)
}

/** Drop empty values, returning undefined when nothing is set (for the payload). */
export function cleanUtm(utm: UtmFields): UtmFields | undefined {
  const out: UtmFields = {}
  for (const [k, v] of Object.entries(utm)) {
    const trimmed = (v ?? '').trim()
    if (trimmed) out[k as keyof UtmFields] = trimmed
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Assemble the final destination URL with UTM params merged in. If the base URL
 * is not yet a valid absolute URL, fall back to a readable concatenation so the
 * preview is still useful while the user is typing.
 */
export function assembleUrl(baseUrl: string, utm: UtmFields): string {
  const base = baseUrl.trim()
  const entries = Object.entries(utm)
    .map(([k, v]) => [PARAM_BY_KEY[k as keyof UtmFields], (v ?? '').trim()] as const)
    .filter(([, v]) => v.length > 0)

  if (entries.length === 0) return base

  try {
    const url = new URL(base)
    for (const [param, val] of entries) url.searchParams.set(param, val)
    return url.toString()
  } catch {
    // Not a parseable URL yet — show a best-effort preview.
    const qs = entries.map(([p, v]) => `${p}=${encodeURIComponent(v)}`).join('&')
    const sep = base.includes('?') ? '&' : '?'
    return base ? `${base}${sep}${qs}` : qs
  }
}

export function UtmBuilder({
  value,
  onChange,
  baseUrl,
  disabled,
  defaultOpen,
}: {
  value: UtmFields
  onChange: (next: UtmFields) => void
  /** The current destination URL, used for the live assembled preview. */
  baseUrl: string
  disabled?: boolean
  defaultOpen?: boolean
}) {
  const groupId = useId()
  const [open, setOpen] = useState(defaultOpen ?? hasUtm(value))
  const active = hasUtm(value)
  const assembled = assembleUrl(baseUrl, value)
  const showPreview = active && baseUrl.trim().length > 0

  return (
    <section className="rounded-md border border-border bg-surface-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={groupId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex items-center gap-2.5">
          <Tag className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <span className="text-body-sm font-medium text-text-primary">UTM tags</span>
          {active && (
            <span className="rounded-pill bg-accent-subtle-bg px-2 py-0.5 text-caption font-medium text-accent">
              On
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-text-tertiary transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={groupId} className="space-y-4 border-t border-border px-4 py-4">
          <p className="text-caption text-text-tertiary">
            Tag the destination for campaign tracking. These are appended to the URL your short link
            redirects to.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UTM_FIELDS.map((f) => {
              const id = `${groupId}-${f.key}`
              return (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={id}>{f.label}</Label>
                  <Input
                    id={id}
                    value={value[f.key] ?? ''}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    aria-describedby={`${id}-param`}
                  />
                  <span id={`${id}-param`} className="block font-mono text-caption text-text-tertiary">
                    {f.param}
                  </span>
                </div>
              )
            })}
          </div>

          {showPreview && (
            <div className="space-y-1.5">
              <span className="text-caption font-medium text-text-secondary">Destination preview</span>
              <output
                aria-live="polite"
                className="block max-h-32 overflow-auto break-all rounded-sm border border-border bg-surface px-3 py-2 font-mono text-caption text-text-primary"
              >
                {assembled}
              </output>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
