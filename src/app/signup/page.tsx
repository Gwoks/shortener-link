/**
 * /signup (public) — thin alias to the sign-up tab of the unified auth screen.
 * ARCHITECTURE §3.2 lists /signup as a route; Auth.js `pages.signIn` is /signin,
 * which hosts both sign-in and sign-up via a tab toggle (DESIGN §5.3). We redirect
 * here so a single screen owns all auth UI while both URLs keep working. Any
 * `?callbackUrl=` is preserved.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string }
}) {
  const cb =
    searchParams.callbackUrl && searchParams.callbackUrl.startsWith('/')
      ? `&callbackUrl=${encodeURIComponent(searchParams.callbackUrl)}`
      : ''
  redirect(`/signin?mode=signup${cb}`)
}
