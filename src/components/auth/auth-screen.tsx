'use client'

/**
 * Auth screen — sign in / sign up (DESIGN §5.3, USER-JOURNEY Journey F / §4.9,
 * FR-27, AC-35). A centered card on --bg-canvas with a tab toggle between sign-in
 * and sign-up. Order (§5.3): Continue with Google → Continue with GitHub →
 * hairline "or" divider → email + password with a primary submit.
 *
 *  - OAuth providers are discovered at runtime via getProviders() so we only show
 *    Google/GitHub when the operator configured them (the app boots offline with
 *    email/password only — ARCHITECTURE §10.2). Provider buttons use next-auth
 *    signIn(provider, { redirectTo }).
 *  - Email/password sign-in uses signIn('credentials', { redirect: false }) so we
 *    can show an inline "wrong credentials" error instead of a redirect.
 *  - Sign-up registers via POST /api/auth/register (api.register) then signs in;
 *    EMAIL_TAKEN and validation errors render inline.
 *  - ?callbackUrl= from the query (middleware sends it) is honored as redirectTo;
 *    defaults to /dashboard.
 *
 * Fully keyboard operable; the password field has a show/hide toggle (icon-button
 * with aria-label). Errors are announced via role=alert (assertive).
 */
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProviders, signIn } from 'next-auth/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { Button } from '../ui/button'
import { Input, Label } from '../ui/input'
import { GitHubIcon, GoogleIcon } from './provider-icons'

type Mode = 'signin' | 'signup'

/** Coarse, non-blocking password strength hint for sign-up (DESIGN §5.3). */
function passwordStrength(pw: string): { label: string; level: 0 | 1 | 2 | 3 } {
  if (!pw) return { label: '', level: 0 }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length < 8) return { label: 'Too short — use at least 8 characters', level: 0 }
  if (score <= 2) return { label: 'Weak', level: 1 }
  if (score <= 3) return { label: 'Okay', level: 2 }
  return { label: 'Strong', level: 3 }
}

const STRENGTH_BAR: Record<0 | 1 | 2 | 3, string> = {
  0: 'w-1/4 bg-danger-fg',
  1: 'w-1/4 bg-danger-fg',
  2: 'w-2/4 bg-warning-fg',
  3: 'w-full bg-success-fg',
}

export function AuthScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'

  const [mode, setMode] = useState<Mode>(initialMode)
  const [oauth, setOauth] = useState<{ google: boolean; github: boolean }>({
    google: false,
    github: false,
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** Which provider button is mid-redirect (disables the others). */
  const [oauthBusy, setOauthBusy] = useState<string | null>(null)

  const emailId = useId()
  const pwId = useId()
  const nameId = useId()
  const errId = useId()
  const strengthId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Discover configured OAuth providers (offline → none, that's fine).
  useEffect(() => {
    let active = true
    getProviders()
      .then((p) => {
        if (!active || !p) return
        setOauth({ google: 'google' in p, github: 'github' in p })
      })
      .catch(() => {
        /* leave both off — email/password still works */
      })
    return () => {
      active = false
    }
  }, [])

  const switchMode = useCallback((next: Mode) => {
    setMode(next)
    setError(null)
  }, [])

  const onOAuth = useCallback(
    async (provider: 'google' | 'github') => {
      setError(null)
      setOauthBusy(provider)
      try {
        // Full redirect to the provider; on return Auth.js sends the user to
        // callbackUrl. We never reach the line after this on success.
        await signIn(provider, { redirectTo: callbackUrl })
      } catch {
        setOauthBusy(null)
        setError('Could not start sign-in with that provider. Please try again.')
      }
    },
    [callbackUrl],
  )

  const finishWithSession = useCallback(() => {
    // Successful credential sign-in: navigate to the intended destination and
    // refresh so server components pick up the new session.
    router.push(callbackUrl)
    router.refresh()
  }, [callbackUrl, router])

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      const trimmedEmail = email.trim()
      if (!trimmedEmail || !/.+@.+\..+/.test(trimmedEmail)) {
        setError('Enter a valid email address.')
        return
      }
      if (!password) {
        setError('Enter your password.')
        return
      }
      if (mode === 'signup' && password.length < 8) {
        setError('Choose a password with at least 8 characters.')
        return
      }

      setSubmitting(true)
      try {
        if (mode === 'signup') {
          // Register, then sign in with the same credentials.
          try {
            await api.register({
              email: trimmedEmail,
              password,
              name: name.trim() || undefined,
            })
          } catch (err) {
            if (err instanceof ApiError) {
              setError(
                err.code === 'EMAIL_TAKEN'
                  ? 'An account with that email already exists. Try signing in instead.'
                  : err.message,
              )
            } else {
              setError('Could not create your account. Please try again.')
            }
            setSubmitting(false)
            return
          }
        }

        const res = await signIn('credentials', {
          email: trimmedEmail,
          password,
          redirect: false,
        })

        if (!res || res.error) {
          setError(
            mode === 'signup'
              ? 'Your account was created, but automatic sign-in failed. Try signing in.'
              : 'Incorrect email or password. Please try again.',
          )
          setSubmitting(false)
          return
        }

        finishWithSession()
      } catch {
        setError('Something went wrong. Please try again.')
        setSubmitting(false)
      }
    },
    [mode, email, password, name, finishWithSession],
  )

  const hasOAuth = oauth.google || oauth.github
  const strength = useMemo(() => passwordStrength(password), [password])

  return (
    <div className="w-full max-w-md">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 ref={headingRef} tabIndex={-1} className="text-h3 text-text-primary outline-none">
          {mode === 'signin' ? 'Sign in to Tess' : 'Create your account'}
        </h1>
        <p className="mt-1 text-body-sm text-text-secondary">
          {mode === 'signin'
            ? 'Manage your links, analytics, and QR codes.'
            : 'Keep your links permanently and unlock full analytics.'}
        </p>

        {/* Sign-in / sign-up tab toggle. */}
        <div
          role="tablist"
          aria-label="Sign in or sign up"
          className="mt-5 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-subtle p-1"
        >
          {(['signin', 'signup'] as const).map((m) => {
            const selected = mode === m
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => switchMode(m)}
                className={`rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-fast ${
                  selected
                    ? 'bg-surface text-text-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            )
          })}
        </div>

        {/* OAuth providers (only those configured). */}
        {hasOAuth && (
          <div className="mt-5 space-y-2">
            {oauth.google && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                loading={oauthBusy === 'google'}
                disabled={!!oauthBusy || submitting}
                onClick={() => onOAuth('google')}
              >
                {oauthBusy !== 'google' && <GoogleIcon className="h-4 w-4" />}
                Continue with Google
              </Button>
            )}
            {oauth.github && (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                loading={oauthBusy === 'github'}
                disabled={!!oauthBusy || submitting}
                onClick={() => onOAuth('github')}
              >
                {oauthBusy !== 'github' && <GitHubIcon className="h-4 w-4" />}
                Continue with GitHub
              </Button>
            )}

            {/* Hairline "or" divider. */}
            <div className="flex items-center gap-3 py-1.5" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-caption text-text-tertiary">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        {/* Email + password. */}
        <form onSubmit={onSubmit} noValidate className={hasOAuth ? 'space-y-4' : 'mt-5 space-y-4'}>
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor={nameId} optional>
                Name
              </Label>
              <Input
                id={nameId}
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                disabled={submitting || !!oauthBusy}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              disabled={submitting || !!oauthBusy}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={pwId}>Password</Label>
            </div>
            <div className="relative">
              <Input
                id={pwId}
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                value={password}
                disabled={submitting || !!oauthBusy}
                aria-describedby={
                  `${error ? errId : ''} ${mode === 'signup' && password ? strengthId : ''}`.trim() ||
                  undefined
                }
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                aria-pressed={showPw}
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:text-text-primary"
              >
                {showPw ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Password-strength helper (sign-up only). */}
            {mode === 'signup' && password && (
              <div id={strengthId} className="space-y-1">
                <div className="h-1 w-full overflow-hidden rounded-pill bg-surface-active">
                  <div
                    className={`h-full rounded-pill transition-all duration-base ${STRENGTH_BAR[strength.level]}`}
                  />
                </div>
                <p className="text-caption text-text-tertiary">{strength.label}</p>
              </div>
            )}
          </div>

          {/* Inline error (assertive). */}
          {error && (
            <p
              id={errId}
              role="alert"
              className="rounded-sm border border-danger-fg/40 bg-danger-bg px-3 py-2 text-body-sm text-danger-fg"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={submitting} disabled={!!oauthBusy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {/* Mode switch affordance below the form. */}
        <p className="mt-5 text-center text-body-sm text-text-secondary">
          {mode === 'signin' ? (
            <>
              New to Tess?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="rounded-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="rounded-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>

      <p className="mt-4 text-center text-caption text-text-tertiary">
        <Link href="/" className="rounded-sm underline-offset-4 hover:text-text-secondary hover:underline">
          ← Back to home
        </Link>
      </p>
    </div>
  )
}
