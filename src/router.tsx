/**
 * SPA route tree (replaces the Next App Router file-system routes). Mirrors
 * ARCHITECTURE §3.2: public landing / auth / dead-link, and a protected group
 * (dashboard/**, settings) wrapped in <AppShell> behind an auth gate.
 *
 * Each route renders the SAME visual components the Next pages composed; only
 * the routing plumbing changed. Route params previously read from Next
 * `{ params }` are read here via react-router `useParams`.
 */
import { createBrowserRouter, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { Suspense } from 'react'
import { useAuth } from '@/auth/auth-context'
import { AppShell, PageHeader } from '@/components/app/app-shell'
import { AuthScreen } from '@/components/auth/auth-screen'
import { GuestHero } from '@/components/guest/guest-hero'
import { PublicTopBar } from '@/components/public/public-top-bar'
import { Spinner } from '@/components/ui/spinner'
import { LinksPage } from '@/components/links/links-page'
import { LinksLoading } from '@/components/links/links-states'
import { CreateLinkPage } from '@/components/links/create-link-page'
import { BulkPage } from '@/components/links/bulk-page'
import { SummaryAnalyticsPage } from '@/components/analytics/summary-analytics-page'
import { LinkDetailPage } from '@/components/links/link-detail-page'
import { LinkAnalyticsPage } from '@/components/analytics/link-analytics-page'
import { SettingsPage } from '@/components/app/settings-page'
import { SkeletonLines } from '@/components/ui/skeleton'

// ── Public screens ────────────────────────────────────────────────────────

function LandingRoute() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicTopBar authenticated={!!user} />
      <main id="main" className="flex flex-1 flex-col items-center px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-guest-hero">
          <GuestHero />
        </div>
      </main>
    </div>
  )
}

function AuthRoute() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicTopBar showAuthLinks={false} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <AuthScreen />
      </main>
    </div>
  )
}

/**
 * /signup is a thin alias to the sign-up tab of the unified auth screen
 * (matching the Next redirect to `/signin?mode=signup`). Any `?callbackUrl=` is
 * preserved so the post-auth destination survives.
 */
function SignUpRedirect() {
  const cbRaw = new URLSearchParams(useLocation().search).get('callbackUrl')
  const cb = cbRaw && cbRaw.startsWith('/') ? `&callbackUrl=${encodeURIComponent(cbRaw)}` : ''
  return <Navigate to={`/signin?mode=signup${cb}`} replace />
}

const DEAD_LINK_COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'The owner set this short link to expire, and it is no longer active.',
  },
  deactivated: {
    title: 'This link is no longer active',
    body: 'The owner has deactivated this short link.',
  },
  'max-clicks': {
    title: 'This link has reached its limit',
    body: 'This short link hit its maximum number of clicks and is no longer active.',
  },
  'not-found': {
    title: 'Link not found',
    body: "We couldn't find a short link at this address. It may have been deleted or never existed.",
  },
}

function DeadLinkRoute() {
  const reason = new URLSearchParams(useLocation().search).get('reason') ?? 'not-found'
  const copy = DEAD_LINK_COPY[reason] ?? DEAD_LINK_COPY['not-found']
  return (
    <main className="center-card" role="main">
      <h1>{copy.title}</h1>
      <p style={{ color: 'var(--muted)' }}>{copy.body}</p>
      <p>
        <a href="/">Shorten your own link &rarr;</a>
      </p>
    </main>
  )
}

// ── Protected group ───────────────────────────────────────────────────────

/**
 * Auth gate + persistent app shell for the protected route group. While the
 * session is resolving we render a quiet spinner; with no user we redirect to
 * /signin (carrying the intended destination as callbackUrl); otherwise we render
 * the shell around the matched child route.
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

  const shellUser = { name: user.name, email: user.email, image: user.image }
  return (
    <AppShell user={shellUser}>
      <Outlet />
    </AppShell>
  )
}

// ── Protected page wrappers (params + headers match the Next pages) ─────────

function DashboardRoute() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Links" />
          <LinksLoading />
        </div>
      }
    >
      <LinksPage />
    </Suspense>
  )
}

function NewLinkRoute() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="New link" />
          <div className="mx-auto w-full max-w-2xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <CreateLinkPage />
    </Suspense>
  )
}

function BulkRoute() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Bulk shorten" />
          <div className="mx-auto w-full max-w-3xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <BulkPage />
    </Suspense>
  )
}

function AnalyticsRoute() {
  return <SummaryAnalyticsPage />
}

function LinkDetailRoute() {
  const { id = '' } = useParams()
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Edit link" />
          <div className="mx-auto w-full max-w-2xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <LinkDetailPage id={id} />
    </Suspense>
  )
}

function LinkAnalyticsRoute() {
  const { id = '' } = useParams()
  return <LinkAnalyticsPage id={id} />
}

function SettingsRoute() {
  const { user } = useAuth()
  const settingsUser = { name: user?.name, email: user?.email, image: user?.image }
  return <SettingsPage user={settingsUser} />
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingRoute /> },
  { path: '/signin', element: <AuthRoute /> },
  { path: '/signup', element: <SignUpRedirect /> },
  { path: '/dead-link', element: <DeadLinkRoute /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: <DashboardRoute /> },
      { path: '/dashboard/new', element: <NewLinkRoute /> },
      { path: '/dashboard/bulk', element: <BulkRoute /> },
      { path: '/dashboard/analytics', element: <AnalyticsRoute /> },
      { path: '/dashboard/links/:id', element: <LinkDetailRoute /> },
      { path: '/dashboard/links/:id/analytics', element: <LinkAnalyticsRoute /> },
      { path: '/settings', element: <SettingsRoute /> },
    ],
  },
])
