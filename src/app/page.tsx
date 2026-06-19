/**
 * Guest landing (DESIGN §5.0/§5.1, USER-JOURNEY Journey A, A-LANDING, FR-32/45).
 * A focused single-purpose hero — paste a URL → shorten → guest result card —
 * NOT a marketing site. This is a public route (outside the protected `(app)`
 * group); the guest shorten path works without a session.
 *
 * Server component: resolves the session once so the top bar can point an already
 * authenticated visitor at the dashboard instead of the sign-in links (Journey A:
 * "if the visitor is already authenticated, point them to the dashboard"). The
 * interactive hero + result cards are a client island (GuestHero).
 */
import { auth } from '@/lib/auth'
import { GuestHero } from '@/components/guest/guest-hero'
import { PublicTopBar } from '@/components/public/public-top-bar'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await auth()
  const authenticated = !!session?.user

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicTopBar authenticated={authenticated} />
      <main id="main" className="flex flex-1 flex-col items-center px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-guest-hero">
          <GuestHero />
        </div>
      </main>
    </div>
  )
}
