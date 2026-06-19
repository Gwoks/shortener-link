'use client'

/**
 * Shared create / edit link form (DESIGN §5.5, USER-JOURNEY §4.3, FR-2/3/15/16/
 * 22/23/44). One scrollable form, grouped into: destination URL, custom alias
 * (live availability), UTM tags (collapsible, live preview), expiration (datetime
 * AND/OR max-click cap), and password protection. Both the create page and the
 * detail/edit page render this so the two screens stay in lockstep.
 *
 * Modes:
 *  - "create": all fields editable; submit issues POST /api/links.
 *  - "edit":   pre-filled from a LinkResource; submit issues PATCH /api/links/:id
 *              with only the changed fields. Password is never echoed back — for a
 *              protected link we show "Set" with a Change affordance (FR-16); a
 *              status switch enables/disables the link (DESIGN §5.5 item 6).
 *
 * Validation is inline per-field and mirrors the server schemas; server-side field
 * errors (ApiError.field) are surfaced on the matching control (USER-JOURNEY §4.3).
 * Submit is disabled while the alias is taken/invalid/checking (DESIGN §5.5 footer).
 */
import { Lock } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { expiryHint, isoToLocalInput, localInputToIso, nowLocalInput } from '../lib/format'
import type { CreateLinkPayload, LinkResource, PatchLinkPayload, UtmFields } from '../lib/types'
import { isValidHttpUrl } from '../lib/url-check'
import { Button } from '../ui/button'
import { Field, Input, Label } from '../ui/input'
import { Switch } from '../ui/switch'
import { useToast } from '../ui/toast'
import { AliasField, aliasAllowsSubmit, type AliasState } from './alias-field'
import { cleanUtm, UtmBuilder } from './utm-builder'

export type LinkFormMode = 'create' | 'edit'

interface FieldErrors {
  url?: string
  alias?: string
  maxClicks?: string
  expiresAt?: string
  password?: string
  form?: string
}

/** Best-effort display origin for the alias adornment, e.g. "tess.link/". */
function useShortOrigin(existing?: LinkResource): string {
  return useMemo(() => {
    if (existing?.shortUrl) {
      try {
        return `${new URL(existing.shortUrl).host}/`
      } catch {
        /* fall through */
      }
    }
    if (typeof window !== 'undefined') return `${window.location.host}/`
    return 'tess.link/'
  }, [existing])
}

export function LinkForm({
  mode,
  link,
  onCreated,
  onUpdated,
  onCancel,
}: {
  mode: LinkFormMode
  /** Required in edit mode — the link being edited. */
  link?: LinkResource
  /** create: called with the freshly created link. */
  onCreated?: (link: LinkResource) => void
  /** edit: called with the updated link. */
  onUpdated?: (link: LinkResource) => void
  onCancel?: () => void
}) {
  const { success, error: toastError } = useToast()
  const origin = useShortOrigin(link)

  // ── Field state ──
  const [url, setUrl] = useState(link?.destinationUrl ?? '')
  const [alias, setAlias] = useState('')
  const [aliasState, setAliasState] = useState<AliasState>({
    status: mode === 'edit' ? 'unchanged' : 'empty',
  })
  const [utm, setUtm] = useState<UtmFields>({})

  const [expiresAt, setExpiresAt] = useState(isoToLocalInput(link?.expiresAt ?? null))
  const [maxClicks, setMaxClicks] = useState(link?.maxClicks != null ? String(link.maxClicks) : '')

  // Password: in edit mode we never receive the value back; a protected link
  // starts "locked" and the user opts into changing/clearing it (FR-16).
  const [pwEnabled, setPwEnabled] = useState(mode === 'create' ? false : !!link?.hasPassword)
  const [pwEditing, setPwEditing] = useState(mode === 'create')
  const [password, setPassword] = useState('')

  // Status toggle (edit only) — enable/disable the link (DESIGN §5.5 item 6).
  const [active, setActive] = useState(mode === 'edit' ? link?.status !== 'DEACTIVATED' : true)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const setFieldError = useCallback((field: keyof FieldErrors, message?: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
  }, [])

  // ── Client-side validation (mirrors server schemas) ──
  function validate(): FieldErrors {
    const next: FieldErrors = {}
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      next.url = 'A destination URL is required.'
    } else if (trimmedUrl.length > 2048) {
      next.url = 'That URL is too long.'
    } else if (!isValidHttpUrl(trimmedUrl)) {
      next.url = 'That doesn’t look like a valid web address. Use a full http(s):// URL.'
    }

    if (!aliasAllowsSubmit(aliasState)) {
      next.alias =
        aliasState.message ??
        (aliasState.status === 'taken'
          ? 'That custom link is taken — pick another.'
          : aliasState.status === 'checking'
            ? 'Still checking that custom link…'
            : 'That custom link can’t be used.')
    }

    const mc = maxClicks.trim()
    if (mc) {
      const n = Number(mc)
      if (!Number.isInteger(n) || n <= 0) {
        next.maxClicks = 'Enter a whole number greater than zero.'
      } else if (n > 1_000_000_000) {
        next.maxClicks = 'That click limit is too large.'
      }
    }

    if (expiresAt) {
      const iso = localInputToIso(expiresAt)
      if (!iso) next.expiresAt = 'Enter a valid date and time.'
      else if (new Date(iso).getTime() <= Date.now()) next.expiresAt = 'Pick a time in the future.'
    }

    if (pwEnabled && pwEditing && password.length === 0) {
      next.password = 'Enter a password, or turn off protection.'
    }

    return next
  }

  // Maps a server ApiError onto the right field; returns a user-facing message.
  const applyServerError = useCallback((e: ApiError) => {
    const field = e.field
    if (field === 'alias' || e.code === 'ALIAS_TAKEN' || e.code === 'ALIAS_RESERVED') {
      setAliasState(
        e.code === 'ALIAS_RESERVED'
          ? { status: 'reserved', message: e.message }
          : { status: 'taken', message: e.message, suggestions: e.suggestions },
      )
      setFieldError('alias', e.message)
    } else if (field === 'url' || e.code === 'INVALID_URL' || e.code === 'URL_BLOCKED') {
      setFieldError('url', e.message)
    } else if (field === 'maxClicks') {
      setFieldError('maxClicks', e.message)
    } else if (field === 'expiresAt') {
      setFieldError('expiresAt', e.message)
    } else if (field === 'password') {
      setFieldError('password', e.message)
    } else {
      setFieldError('form', e.message)
    }
  }, [setFieldError])

  // ── Submit ──
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setFieldError('form', undefined)
      const v = validate()
      setErrors(v)
      if (Object.values(v).some(Boolean)) {
        // Focus the first invalid control for keyboard/AT users.
        const first = document.querySelector<HTMLElement>('[aria-invalid="true"]')
        first?.focus()
        return
      }

      setSubmitting(true)
      try {
        if (mode === 'create') {
          const payload: CreateLinkPayload = { url: url.trim() }
          if (alias.trim()) payload.alias = alias.trim()
          const isoExp = expiresAt ? localInputToIso(expiresAt) : null
          if (isoExp) payload.expiresAt = isoExp
          if (maxClicks.trim()) payload.maxClicks = Number(maxClicks.trim())
          if (pwEnabled && password) payload.password = password
          const cleaned = cleanUtm(utm)
          if (cleaned) payload.utm = cleaned

          const res = await api.createLink(payload)
          success('Link created!', res.link.shortUrl)
          onCreated?.(res.link)
        } else if (link) {
          const payload: PatchLinkPayload = {}
          const trimmedUrl = url.trim()
          if (trimmedUrl !== link.destinationUrl) payload.destinationUrl = trimmedUrl

          // Expiry: compare normalized ISO; allow clearing.
          const isoExp = expiresAt ? localInputToIso(expiresAt) : null
          const currentExp = link.expiresAt
          if ((isoExp ?? null) !== (currentExp ?? null)) {
            // Avoid a no-op when the same instant round-trips through the picker.
            const same =
              isoExp && currentExp && new Date(isoExp).getTime() === new Date(currentExp).getTime()
            if (!same) payload.expiresAt = isoExp
          }

          const mcNum = maxClicks.trim() ? Number(maxClicks.trim()) : null
          if (mcNum !== (link.maxClicks ?? null)) payload.maxClicks = mcNum

          const nextStatus = active ? 'ACTIVE' : 'DEACTIVATED'
          const currentStatus = link.status === 'DEACTIVATED' ? 'DEACTIVATED' : 'ACTIVE'
          if (nextStatus !== currentStatus) payload.status = nextStatus

          // Password transitions: clear when disabled, set when (re)entered.
          if (!pwEnabled && link.hasPassword) {
            payload.password = null
          } else if (pwEnabled && pwEditing && password) {
            payload.password = password
          }

          if (Object.keys(payload).length === 0) {
            toastError('No changes to save', 'Edit a field before saving.')
            setSubmitting(false)
            return
          }

          const res = await api.patchLink(link.id, payload)
          success('Changes saved', res.link.shortUrl)
          onUpdated?.(res.link)
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'RATE_LIMITED') {
            const wait = err.retryAfter ? ` Try again in ${err.retryAfter}s.` : ''
            setFieldError('form', `You’re doing that too fast.${wait}`)
          } else {
            applyServerError(err)
          }
          toastError(
            mode === 'create' ? 'Couldn’t create the link' : 'Couldn’t save changes',
            err.message,
          )
        } else {
          setFieldError('form', 'Something went wrong. Please try again.')
          toastError('Network error', 'Check your connection and try again.')
        }
        setSubmitting(false)
        return
      }
      setSubmitting(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, url, alias, aliasState, expiresAt, maxClicks, pwEnabled, pwEditing, password, utm, active, link],
  )

  const submitDisabled = submitting || !aliasAllowsSubmit(aliasState)
  const hint = expiryHint(
    expiresAt ? localInputToIso(expiresAt) : null,
    maxClicks.trim() ? Number(maxClicks.trim()) : null,
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {/* Destination URL */}
      <Field
        label="Destination URL"
        error={errors.url}
        helper="The long URL your short link will point to."
        render={({ id, describedBy, invalid }) => (
          <Input
            id={id}
            mono
            type="url"
            inputMode="url"
            autoComplete="url"
            autoFocus={mode === 'create'}
            placeholder="https://example.com/a-very-long-url"
            value={url}
            invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => {
              setUrl(e.target.value)
              if (errors.url) setFieldError('url', undefined)
            }}
          />
        )}
      />

      {/* Custom alias with live availability (create only — the code is fixed
          once a link exists so its QR/printed copies stay valid). */}
      {mode === 'create' && (
        <AliasField
          value={alias}
          onChange={(v) => {
            setAlias(v)
            if (errors.alias) setFieldError('alias', undefined)
          }}
          state={aliasState}
          onStateChange={setAliasState}
          origin={origin}
        />
      )}

      {/* UTM builder + live preview (create only — UTM params are baked into the
          destination URL at create time; on edit you edit the final URL directly). */}
      {mode === 'create' && <UtmBuilder value={utm} onChange={setUtm} baseUrl={url} />}

      {/* Expiration: datetime AND/OR max-click cap */}
      <fieldset className="space-y-4 rounded-md border border-border p-4">
        <legend className="px-1 text-body-sm font-medium text-text-primary">Expiration (optional)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Expires on"
            optional
            error={errors.expiresAt}
            render={({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="datetime-local"
                min={nowLocalInput()}
                value={expiresAt}
                invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setExpiresAt(e.target.value)
                  if (errors.expiresAt) setFieldError('expiresAt', undefined)
                }}
              />
            )}
          />
          <Field
            label="Max clicks"
            optional
            error={errors.maxClicks}
            render={({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="e.g. 100"
                value={maxClicks}
                invalid={invalid}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setMaxClicks(e.target.value)
                  if (errors.maxClicks) setFieldError('maxClicks', undefined)
                }}
              />
            )}
          />
        </div>
        <p className="text-caption text-text-tertiary" aria-live="polite">
          {hint ? `This link ${hint}.` : 'Leave both blank for a link that never expires.'}
        </p>
      </fieldset>

      {/* Password protection */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              Password protection
            </Label>
            <p className="mt-1 text-caption text-text-tertiary">
              Require a password before the destination is revealed.
            </p>
          </div>
          <Switch
            checked={pwEnabled}
            aria-label="Require a password"
            onCheckedChange={(checked) => {
              setPwEnabled(checked)
              setFieldError('password', undefined)
              if (checked) {
                // Turning on (or re-enabling) → reveal the input.
                setPwEditing(true)
              } else {
                setPwEditing(mode === 'create')
                setPassword('')
              }
            }}
          />
        </div>

        {pwEnabled && (
          <div className="mt-4">
            {mode === 'edit' && link?.hasPassword && !pwEditing ? (
              <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-subtle px-3 py-2">
                <span className="text-body-sm text-text-secondary">
                  A password is set for this link.
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPwEditing(true)}>
                  Change
                </Button>
              </div>
            ) : (
              <Field
                label={mode === 'edit' && link?.hasPassword ? 'New password' : 'Password'}
                error={errors.password}
                render={({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Enter a password"
                    value={password}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errors.password) setFieldError('password', undefined)
                    }}
                  />
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* Status toggle (edit only) */}
      {mode === 'edit' && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
          <div className="min-w-0">
            <Label className="font-medium">Link active</Label>
            <p className="mt-1 text-caption text-text-tertiary">
              Turn off to stop this link from redirecting without deleting it.
            </p>
          </div>
          <Switch checked={active} aria-label="Link active" onCheckedChange={setActive} />
        </div>
      )}

      {mode === 'edit' && (
        <p className="text-caption text-text-tertiary">Changes apply to new clicks immediately.</p>
      )}

      {/* Form-level error */}
      {errors.form && (
        <p role="alert" className="rounded-sm border border-danger-fg/40 bg-danger-bg/40 px-3 py-2 text-body-sm text-danger-fg">
          {errors.form}
        </p>
      )}

      {/* Footer actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting} disabled={submitDisabled}>
          {mode === 'create' ? 'Create link' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
