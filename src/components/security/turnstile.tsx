/**
 * Cloudflare Turnstile integration for the protected forms (sign-in, sign-up,
 * shorten). The backend verifies the token sent in the `CF-Turnstile-Response`
 * header and binds it to the form's `action`.
 *
 * The widget only renders when `VITE_TURNSTILE_SITE_KEY` is set at build time;
 * otherwise `useTurnstile` reports ready with no token so forms work unchanged
 * (local dev / e2e without keys).
 */
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useCallback, useMemo, useRef, useState } from 'react'

const SITE_KEY: string = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim()

export const TURNSTILE_ENABLED = SITE_KEY.length > 0

/** Must match the backend's ACTION_* constants in services/turnstile.rs. */
export type TurnstileAction = 'login' | 'signup' | 'shorten'

export interface TurnstileState {
  /** Current single-use token, or null when not (yet) solved. */
  token: string | null
  /** True when the form may submit: widget solved, or Turnstile disabled. */
  isReady: boolean
  /** The widget to render inside the form (null when disabled). */
  widget: React.ReactNode
  /** Discard the used token and request a fresh one. Call after every submit. */
  reset: () => void
}

export function useTurnstile(action: TurnstileAction): TurnstileState {
  const ref = useRef<TurnstileInstance>()
  // Tokens are bound to the action they were solved for; a token from another
  // action (e.g. after switching sign-in → sign-up) is never exposed.
  const [solved, setSolved] = useState<{ action: TurnstileAction; value: string } | null>(null)
  const [hasError, setHasError] = useState(false)
  const token = solved?.action === action ? solved.value : null

  const reset = useCallback(() => {
    setSolved(null)
    setHasError(false)
    ref.current?.reset()
  }, [])

  const onSuccess = useCallback(
    (value: string) => {
      setSolved({ action, value })
      setHasError(false)
    },
    [action],
  )
  const onExpire = useCallback(() => setSolved(null), [])
  const onError = useCallback(() => {
    setSolved(null)
    setHasError(true)
  }, [])

  const widget = useMemo(
    () =>
      TURNSTILE_ENABLED ? (
        <div className="space-y-1.5">
          <Turnstile
            key={action}
            ref={ref}
            siteKey={SITE_KEY}
            options={{ action, theme: 'auto', size: 'flexible' }}
            onSuccess={onSuccess}
            onExpire={onExpire}
            onError={onError}
          />
          {hasError && (
            <p role="alert" className="text-body-sm text-danger-fg">
              Human verification didn’t complete. Try the check again, or refresh the page.
            </p>
          )}
        </div>
      ) : null,
    [action, hasError, onSuccess, onExpire, onError],
  )

  return useMemo(
    () => ({ token, isReady: !TURNSTILE_ENABLED || token !== null, widget, reset }),
    [token, widget, reset],
  )
}
