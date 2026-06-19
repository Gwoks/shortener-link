/**
 * Auth screen route — /signin (public). DESIGN §5.3, USER-JOURNEY Journey F.
 * Handles both sign-in and sign-up via a tab toggle in <AuthScreen>; the route
 * is /signin to match `pages.signIn` in src/lib/auth.ts and the middleware
 * redirect target. A `?mode=signup` query opens the sign-up tab; `?callbackUrl=`
 * (sent by the middleware) is honored as the post-auth destination.
 *
 * Server component: if the visitor is already authenticated, skip the screen and
 * send them straight to their intended destination (or the dashboard). The
 * interactive form is a client island wrapped in Suspense (it reads
 * useSearchParams).
 */
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { AuthScreen } from '@/components/auth/auth-screen'
import { PublicTopBar } from '@/components/public/public-top-bar'
import { Spinner } from '@/components/ui/spinner'

export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; mode?: string }
}) {
  const session = await auth()
  if (session?.user) {
    const dest = searchParams.callbackUrl && searchParams.callbackUrl.startsWith('/')
      ? searchParams.callbackUrl
      : '/dashboard'
    redirect(dest)
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicTopBar showAuthLinks={false} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Suspense
          fallback={
            <div className="flex h-40 items-center justify-center" aria-busy="true">
              <Spinner className="h-6 w-6 text-text-tertiary" />
              <span className="sr-only">Loading sign-in…</span>
            </div>
          }
        >
          <AuthScreen />
        </Suspense>
      </main>
    </div>
  )
}
