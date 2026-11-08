/**
 * SPA route tree. Public screens (landing, auth, not-found) share one
 * PublicLayout; the protected group (dashboard/**, settings) sits behind an
 * auth gate inside <AppShell>. Dead / expired short links never reach the SPA —
 * the backend renders those pages itself (services/clicker_pages.rs).
 */
import type { ReactNode } from 'react'
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { SummaryAnalyticsPage } from '@/components/analytics/summary-analytics-page'
import { LinkAnalyticsPage } from '@/components/analytics/link-analytics-page'
import { AppShell } from '@/components/app/app-shell'
import { SettingsPage } from '@/components/app/settings-page'
import { TopNav } from '@/components/app/top-nav'
import { AuthScreen } from '@/components/auth/auth-screen'
import { LandingPage } from '@/components/landing/landing-page'
import { BulkPage } from '@/components/links/bulk-page'
import { CreateLinkPage } from '@/components/links/create-link-page'
import { LinkDetailPage } from '@/components/links/link-detail-page'
import { LinksPage } from '@/components/links/links-page'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { StateCard } from '@/components/ui/state-card'

// ── Public screens ────────────────────────────────────────────────────────

function PublicLayout({
  children,
  showNavActions = true,
}: {
  children: ReactNode
  showNavActions?: boolean
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav variant="public" showActions={showNavActions} />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  )
}

function LandingRoute() {
  return (
    <PublicLayout>
      <LandingPage />
    </PublicLayout>
  )
}

function AuthRoute() {
  return (
    <PublicLayout showNavActions={false}>
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <AuthScreen />
      </div>
    </PublicLayout>
  )
}

/**
 * /signup is a thin alias to the sign-up tab of the unified auth screen. Any
 * same-origin `?callbackUrl=` is preserved so the post-auth destination survives.
 */
function SignUpRedirect() {
  const cbRaw = new URLSearchParams(useLocation().search).get('callbackUrl')
  const cb = cbRaw && cbRaw.startsWith('/') ? `&callbackUrl=${encodeURIComponent(cbRaw)}` : ''
  return <Navigate to={`/signin?mode=signup${cb}`} replace />
}

function NotFoundRoute() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-form px-4 py-section sm:px-6">
        <StateCard
          title="Page not found"
          description="We couldn’t find anything at this address."
          actions={
            <Button asChild>
              <Link to="/">Go home</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  )
}

// ── Protected group ───────────────────────────────────────────────────────

/**
 * Auth gate + persistent app shell. While the session resolves we show a quiet
 * spinner; with no user we redirect to /signin carrying the destination.
 */
function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas" aria-busy="true">
        <Spinner className="h-6 w-6 text-text-tertiary" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/signin?callbackUrl=${encodeURIComponent(location.pathname)}`} replace />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function LinkDetailRoute() {
  const { id = '' } = useParams()
  return <LinkDetailPage id={id} />
}

function LinkAnalyticsRoute() {
  const { id = '' } = useParams()
  return <LinkAnalyticsPage id={id} />
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingRoute /> },
  { path: '/signin', element: <AuthRoute /> },
  { path: '/signup', element: <SignUpRedirect /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: <LinksPage /> },
      { path: '/dashboard/new', element: <CreateLinkPage /> },
      { path: '/dashboard/bulk', element: <BulkPage /> },
      { path: '/dashboard/analytics', element: <SummaryAnalyticsPage /> },
      { path: '/dashboard/links/:id', element: <LinkDetailRoute /> },
      { path: '/dashboard/links/:id/analytics', element: <LinkAnalyticsRoute /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundRoute /> },
])
