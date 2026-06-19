/**
 * Client-side auth context for the Vite SPA (replaces next-auth `SessionProvider`
 * / `useSession`). On mount it resolves the session from `GET /api/session`
 * (same-origin cookie) and exposes the signed-in user plus a `refresh()` so the
 * auth screen and app shell can react to login/logout without a full reload.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Shape returned by GET /api/session: `{ user: {...} | null }`. */
interface SessionResponse {
  user: Partial<AuthUser> | null
}

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' })
    if (!res.ok) return null
    const body = (await res.json()) as SessionResponse
    if (!body?.user) return null
    const u = body.user
    return {
      id: u.id ?? '',
      email: u.email ?? null,
      name: u.name ?? null,
      image: u.image ?? null,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await fetchSession()
    setUser(next)
  }, [])

  useEffect(() => {
    let active = true
    void fetchSession().then((next) => {
      if (!active) return
      setUser(next)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
