'use client'

/**
 * Public top bar (DESIGN §5.0 guest frames, §5.1). A minimal bar shared by the
 * guest landing hero and the auth screens: wordmark on the left; sign in / sign
 * up + theme toggle on the right. When the visitor is already authenticated we
 * swap the auth links for a single "Go to dashboard" affordance (USER-JOURNEY
 * Journey A success → "point them to the dashboard").
 *
 * Kept presentational and prop-driven (no session read here) so it works in both
 * server-rendered pages (which resolve the session once) and the auth screens.
 */
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../app/theme-toggle'
import { Button } from '../ui/button'

function Wordmark() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 rounded-sm text-h4 font-bold tracking-tight text-text-primary"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-body-sm font-bold text-text-on-accent"
      >
        T
      </span>
      Tess
    </Link>
  )
}

export function PublicTopBar({
  authenticated = false,
  /** Hide the auth links entirely (e.g. while already on the auth screen). */
  showAuthLinks = true,
}: {
  authenticated?: boolean
  showAuthLinks?: boolean
}) {
  return (
    <header className="flex h-header w-full shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-2 sm:gap-3">
        {showAuthLinks &&
          (authenticated ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
                <Link to="/signin?mode=signup">Sign up</Link>
              </Button>
            </>
          ))}
        <ThemeToggle />
      </div>
    </header>
  )
}
