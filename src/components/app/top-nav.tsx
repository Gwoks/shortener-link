/**
 * Top navigation (DESIGN.md §Layout): a 64px sticky bar on every screen —
 * wordmark left, centered muted nav links (app only), actions right. Replaces
 * both the old dashboard sidebar and the separate public top bar.
 *
 * `variant="app"`    → nav links + "New link" + account menu; on small screens
 *                      the links collapse into a right-hand Sheet.
 * `variant="public"` → sign in / get started (or "Go to dashboard").
 */
import { LogOut, Menu as MenuIcon, Plus, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth, type AuthUser } from '@/auth/auth-context'
import { signOut } from '@/auth/auth-client'
import { Wordmark } from '../brand/wordmark'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { Dialog, DialogTrigger, SheetContent } from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu'
import { Avatar } from './avatar'
import { isNavActive, NAV_ITEMS } from './nav-items'

type NavVariant = 'app' | 'public'

function NavLinks({
  pathname,
  orientation,
  onNavigate,
}: {
  pathname: string
  orientation: 'row' | 'column'
  onNavigate?: () => void
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn('flex gap-1', orientation === 'column' ? 'flex-col' : 'items-center')}
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(item, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-sm px-4 py-2.5 text-body-sm font-medium transition-colors duration-base',
              active ? 'text-accent' : 'text-text-nav hover:text-text-primary',
              orientation === 'column' && active && 'bg-sky-tint',
            )}
          >
            {orientation === 'column' && <Icon className="h-4 w-4" aria-hidden="true" />}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function displayName(user: AuthUser): string {
  return user.name || user.email || 'Your account'
}

function AccountMenu({ user }: { user: AuthUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${displayName(user)}`}
          className="rounded-pill transition-opacity duration-base hover:opacity-80"
        >
          <Avatar name={user.name} email={user.email} image={user.image} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="truncate px-2.5 pb-1.5 text-body-sm text-text-secondary">
          {user.email ?? displayName(user)}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()} destructive>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)

  // Close whenever the route changes.
  useEffect(() => setOpen(false), [pathname])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="md:hidden">
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <SheetContent aria-describedby={undefined} closeLabel="Close navigation menu">
        <div className="flex h-header shrink-0 items-center px-5">
          <Wordmark to="/dashboard" />
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-6">
          <Button asChild className="mx-2">
            <Link to="/dashboard/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New link
            </Link>
          </Button>
          <NavLinks pathname={pathname} orientation="column" />
        </div>
      </SheetContent>
    </Dialog>
  )
}

function AppActions({ user, pathname }: { user: AuthUser; pathname: string }) {
  return (
    <>
      <Button asChild variant="secondary" className="hidden sm:inline-flex">
        <Link to="/dashboard/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New link
        </Link>
      </Button>
      <AccountMenu user={user} />
      <MobileNav pathname={pathname} />
    </>
  )
}

function PublicActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) {
    return (
      <Button asChild variant="secondary">
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    )
  }
  return (
    <>
      <Button asChild variant="ghost">
        <Link to="/signin">Sign in</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link to="/signin?mode=signup">Get started</Link>
      </Button>
    </>
  )
}

export function TopNav({
  variant,
  showActions = true,
}: {
  variant: NavVariant
  /** Hide the right-hand actions (e.g. on the auth screen itself). */
  showActions?: boolean
}) {
  const { user } = useAuth()
  const pathname = useLocation().pathname
  const isApp = variant === 'app' && user !== null

  return (
    <header className="sticky top-0 z-nav h-header shrink-0 bg-surface shadow-nav">
      <div className="mx-auto flex h-full w-full max-w-page items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Wordmark to={isApp ? '/dashboard' : '/'} />
        {isApp && (
          <div className="hidden flex-1 justify-center md:flex">
            <NavLinks pathname={pathname} orientation="row" />
          </div>
        )}
        {showActions && (
          <div className="ml-auto flex items-center gap-2">
            {isApp ? (
              <AppActions user={user} pathname={pathname} />
            ) : (
              <PublicActions isAuthenticated={user !== null} />
            )}
          </div>
        )}
      </div>
    </header>
  )
}
