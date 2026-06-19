/**
 * Authenticated route-group layout (ARCHITECTURE §3.2/§4.1, DESIGN §4.7).
 * Server component: resolves the session via `auth()` and renders the persistent
 * app shell around every authenticated page (/dashboard/**, /settings).
 *
 * `middleware.ts` already gates these routes (cookie presence); this re-checks
 * the session server-side and redirects to /signin when absent (never trusts the
 * middleware alone, per §4.1).
 */
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/app/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) {
    redirect('/signin')
  }

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  }

  return <AppShell user={user}>{children}</AppShell>
}
