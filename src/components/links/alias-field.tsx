'use client'

/**
 * Custom-alias field (DESIGN §5.5 item 2, USER-JOURNEY §4.4, FR-2/3/44, AC-4/5).
 * Sits on the IA boundary (alias namespace == app route namespace), so it must
 * tell the user precisely *why* an alias is unusable: invalid charset/length,
 * reserved word, or already taken (with suggested alternatives).
 *
 * Behavior:
 *  - Syntax + reserved checks run locally and instantly (mirrors src/lib/alias.ts).
 *  - Availability is a debounced call to `GET /api/links/check-alias` (AC-4).
 *  - State is surfaced both visually (icon + text, never color alone, AC-5) and to
 *    assistive tech via an aria-live region + aria-invalid/aria-describedby.
 *  - Suggestions (on "taken") are real buttons that fill the field.
 *
 * The parent owns the alias string and the resolved AliasState (so it can gate
 * submission while the alias is taken/invalid/checking — DESIGN §5.5 footer).
 */
import { Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'
import { Input, Label } from '../ui/input'

/** Resolved status of the alias field, owned by the parent for submit gating. */
export type AliasStatus =
  | 'empty' // nothing entered → random code will be assigned
  | 'checking' // debounced availability request in flight
  | 'available'
  | 'taken'
  | 'reserved'
  | 'invalid'
  | 'unchanged' // edit mode: equals the link's current code → always allowed

export interface AliasState {
  status: AliasStatus
  message?: string
  suggestions?: string[]
}

/** True when the current alias state must not block form submission. */
export function aliasAllowsSubmit(state: AliasState): boolean {
  return state.status === 'empty' || state.status === 'available' || state.status === 'unchanged'
}

// Mirror of src/lib/alias.ts so we can validate synchronously before any request.
const ALIAS_MIN = 3
const ALIAS_MAX = 50
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/
const RESERVED = new Set(
  [
    'api', 'login', 'signin', 'signup', 'logout', 'app', 'dashboard', 'admin', 'settings',
    'account', 'analytics', 'links', 'bulk', 'qr', 'auth', 'healthz', 'health', 'dead-link',
    'gate', '_next', 'static', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml',
  ].map((w) => w.toLowerCase()),
)

function localValidate(raw: string): AliasState | null {
  const alias = raw.trim()
  if (alias.length === 0) return { status: 'empty' }
  if (alias.length < ALIAS_MIN || alias.length > ALIAS_MAX) {
    return { status: 'invalid', message: `Custom links must be ${ALIAS_MIN}–${ALIAS_MAX} characters.` }
  }
  if (!ALIAS_PATTERN.test(alias)) {
    return { status: 'invalid', message: 'Use only letters, numbers, hyphens, and underscores.' }
  }
  if (RESERVED.has(alias.toLowerCase())) {
    return {
      status: 'reserved',
      message: 'That word is reserved by the app and can’t be used as a custom link.',
    }
  }
  return null // passes local checks → needs an availability request
}

const HINTS: Record<AliasStatus, { text: string; cls: string } | null> = {
  empty: null,
  checking: { text: 'Checking availability…', cls: 'text-text-tertiary' },
  available: { text: 'Available', cls: 'text-success-fg' },
  taken: { text: 'That custom link is taken.', cls: 'text-danger-fg' },
  reserved: { text: '', cls: 'text-danger-fg' },
  invalid: { text: '', cls: 'text-danger-fg' },
  unchanged: { text: 'This is the current link.', cls: 'text-text-tertiary' },
}

export function AliasField({
  value,
  onChange,
  state,
  onStateChange,
  /** Display origin shown as a static adornment, e.g. "tess.link/". */
  origin,
  /** Edit mode: the link's existing code; an unchanged alias is always allowed. */
  currentCode,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  state: AliasState
  onStateChange: (s: AliasState) => void
  origin: string
  currentCode?: string
  disabled?: boolean
}) {
  const fieldId = useId()
  const descId = `${fieldId}-desc`
  const reqId = useRef(0)
  const [debounced, setDebounced] = useState(value)

  // Debounce the raw value (350ms) so we don't fire on every keystroke (AC-4).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 350)
    return () => clearTimeout(t)
  }, [value])

  // Resolve state from the debounced value: local checks first, then network.
  useEffect(() => {
    const raw = debounced.trim()

    // Edit mode short-circuit: the existing code is always valid as-is.
    if (currentCode && raw.toLowerCase() === currentCode.toLowerCase()) {
      onStateChange({ status: 'unchanged' })
      return
    }

    const local = localValidate(raw)
    if (local) {
      onStateChange(local)
      return
    }

    // Passed local validation → confirm availability.
    const id = ++reqId.current
    onStateChange({ status: 'checking' })
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.checkAlias(raw)
        if (cancelled || id !== reqId.current) return
        if (res.available) {
          onStateChange({ status: 'available' })
        } else if (res.reason === 'reserved') {
          onStateChange({
            status: 'reserved',
            message: 'That word is reserved by the app and can’t be used as a custom link.',
          })
        } else if (res.reason === 'invalid') {
          onStateChange({ status: 'invalid', message: 'That custom link isn’t valid.' })
        } else {
          onStateChange({ status: 'taken', suggestions: res.suggestions })
        }
      } catch (e) {
        if (cancelled || id !== reqId.current) return
        // A rate-limited / network failure shouldn't hard-block: treat as unknown
        // and let server-side validation be the backstop on submit.
        const msg =
          e instanceof ApiError && e.code === 'RATE_LIMITED'
            ? 'Too many checks — try again in a moment.'
            : 'Couldn’t check availability right now.'
        onStateChange({ status: 'checking', message: msg })
      }
    })()
    return () => {
      cancelled = true
    }
    // onStateChange is stable (useCallback in parent); currentCode is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, currentCode])

  const applySuggestion = useCallback(
    (s: string) => {
      onChange(s)
    },
    [onChange],
  )

  const hint = HINTS[state.status]
  const message = state.message ?? hint?.text ?? ''
  const isError = state.status === 'taken' || state.status === 'reserved' || state.status === 'invalid'
  const showSuggestions = state.status === 'taken' && (state.suggestions?.length ?? 0) > 0

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} optional>
        Custom link
      </Label>
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-sm border border-border-strong bg-surface transition-colors focus-within:border-accent',
          isError && 'border-danger-fg focus-within:border-danger-fg',
          disabled && 'opacity-60',
        )}
      >
        <span
          className="flex select-none items-center whitespace-nowrap border-r border-border-strong bg-surface-subtle px-3 font-mono text-body-sm text-text-tertiary"
          aria-hidden="true"
        >
          {origin}
        </span>
        <Input
          id={fieldId}
          mono
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="my-link"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={message ? descId : undefined}
          aria-invalid={isError || undefined}
          // Strip the input's own border so the group owns the frame.
          className="rounded-none border-0 bg-transparent focus:border-0"
        />
        <span className="flex w-9 items-center justify-center" aria-hidden="true">
          {state.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />}
          {(state.status === 'available' || state.status === 'unchanged') && (
            <Check className="h-4 w-4 text-success-fg" />
          )}
          {isError && <X className="h-4 w-4 text-danger-fg" />}
        </span>
      </div>

      {/* Status line — also announced to assistive tech. */}
      {message ? (
        <p
          id={descId}
          className={cn('text-body-sm', hint?.cls ?? 'text-text-tertiary')}
          role={isError ? 'alert' : undefined}
          aria-live={isError ? undefined : 'polite'}
        >
          {message}
        </p>
      ) : (
        <p className="text-body-sm text-text-tertiary">
          Pick a memorable ending, or leave blank for a random short code.
        </p>
      )}

      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-caption text-text-tertiary">Try:</span>
          {state.suggestions!.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applySuggestion(s)}
              className="rounded-pill border border-border-strong bg-surface px-2.5 py-0.5 font-mono text-caption text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
