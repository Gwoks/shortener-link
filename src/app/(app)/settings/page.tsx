/**
 * Settings route (ARCHITECTURE §3.2/§4.1, DESIGN §5.11, FR-41, AC-46).
 * Server component: resolves the session via `auth()` and passes the signed-in
 * identity to the client SettingsPage (theme toggle + sign out + privacy note).
 * The route group already gates auth; we re-read the session rather than trust
 * the layout alone, and redirect to /signin if it's somehow absent.
 */
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SettingsPage } from '@/components/app/settings-page'

export const dynamic = 'force-dynamic'

export default async function SettingsRoute() {
  const session = await auth()
  if (!session?.user) {
    redirect('/signin')
  }

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  }

  return <SettingsPage user={user} />
}
