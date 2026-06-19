/**
 * Auth client for the Vite SPA (replaces next-auth/react `signIn`/`signOut`/
 * `getProviders`). All calls are same-origin against the Rust API under /api/*.
 *
 * - signInCredentials → POST /api/auth/login (email + password).
 * - signOut           → POST /api/auth/logout, then hard-redirect home.
 * - signInOAuth       → full-page redirect to the backend OAuth start endpoint.
 * - getProviders      → the static provider set the auth screen needs.
 */
import { ApiError } from '@/components/lib/api'

export type OAuthProvider = 'google' | 'github'

/** Provider descriptor shape consumed by the auth screen (id + label). */
export interface ProviderInfo {
  id: OAuthProvider
  name: string
}

export type ProvidersMap = Record<OAuthProvider, ProviderInfo>

/**
 * Sign in with email + password. Throws ApiError on bad credentials so callers
 * can render an inline message. On success the caller should call the auth
 * context `refresh()` to pick up the new session.
 */
export async function signInCredentials(email: string, password: string): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new ApiError('INTERNAL', 'Network error. Check your connection and try again.', 0)
  }

  if (!res.ok) {
    let code = 'UNAUTHORIZED'
    let message = 'Incorrect email or password. Please try again.'
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.code) code = body.error.code
      if (body?.error?.message) message = body.error.message
    } catch {
      /* non-JSON error body — keep defaults */
    }
    throw new ApiError(code as ApiError['code'], message, res.status)
  }
}

/** Sign out, then hard-redirect to the public landing page. */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    /* ignore network errors — we still want to leave the authed UI */
  }
  window.location.href = '/'
}

/** Start an OAuth flow via a full-page redirect to the backend. */
export function signInOAuth(provider: OAuthProvider): void {
  window.location.href = `/api/auth/oauth/${provider}`
}

/**
 * The OAuth providers the UI offers. The previous next-auth `getProviders()`
 * discovered configured providers at runtime; here we expose the same set the
 * screen renders (Google + GitHub). Returns a Promise to keep the auth screen's
 * existing async discovery flow unchanged.
 */
export function getProviders(): Promise<ProvidersMap> {
  return Promise.resolve({
    google: { id: 'google', name: 'Google' },
    github: { id: 'github', name: 'GitHub' },
  })
}
