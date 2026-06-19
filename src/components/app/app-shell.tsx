'use client'

/**
 * Authenticated app shell (DESIGN §4.7, §5.0, §5.4; USER-JOURNEY §2.2; A-NAV).
 * Persistent left sidebar on desktop; a focus-trapped slide-in drawer on mobile
 * (Radix Dialog → Escape/scrim/scroll-lock for free). A slim sticky top bar holds
 * the mobile hamburger + theme toggle; each page renders its own <PageHeader>
 * (title + contextual actions) as the first block of its content column.
 *
 * A skip-to-content link is the first focusable element (a11y, DESIGN §4.7/§6).
 * Routes follow ARCHITECTURE §3.2; sign-out uses the SPA auth client.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { LogOut, Menu as MenuIcon, Plus, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { signOut } from '@/auth/auth-client'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu'
import { Avatar } from './avatar'
import { ThemeToggle } from './theme-toggle'
import { isNavActive, NAV_ITEMS } from './nav-items'

export interface ShellUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

const SKIP_TARGET_ID = 'app-main-content'

function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to="/dashboard"
      onClick={onNavigate}
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

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
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
              'relative flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm font-medium transition-colors duration-fast',
              active
                ? 'bg-accent-subtle-bg text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-pill bg-accent"
              />
            )}
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserMenu({ user }: { user: ShellUser }) {
  const displayName = user.name || user.email || 'Account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-sm border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
        >
          <Avatar name={user.name} email={user.email} image={user.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm font-medium text-text-primary">{displayName}</span>
            {user.name && user.email && (
              <span className="block truncate text-caption text-text-tertiary">{user.email}</span>
            )}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[min(16rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="truncate px-2.5 pb-1.5 text-body-sm text-text-secondary">
          {user.email ?? displayName}
        </div>
        <DropdownMenuSeparator />
        <div className="px-2.5 py-2">
          <p className="mb-1.5 text-overline uppercase text-text-tertiary">Theme</p>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} destructive>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shared sidebar body (used by both the desktop rail and the mobile drawer). */
function SidebarBody({
  user,
  pathname,
  onNavigate,
}: {
  user: ShellUser
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-header shrink-0 items-center px-4">
        <Wordmark onNavigate={onNavigate} />
      </div>
      <div className="px-3 pb-2">
        <Button asChild className="w-full justify-center">
          <Link to="/dashboard/new" onClick={onNavigate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New link
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <NavList pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <UserMenu user={user} />
      </div>
    </div>
  )
}

function MobileDrawer({ user, pathname }: { user: ShellUser; pathname: string }) {
  const [open, setOpen] = useState(false)

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation menu">
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-modal bg-[var(--overlay-scrim)] data-[state=open]:animate-overlay-in"
          style={{ zIndex: 1200 }}
        />
        <DialogPrimitive.Content
          style={{ zIndex: 1200 }}
          className={cn(
            'fixed inset-y-0 left-0 z-modal flex w-[min(17rem,85vw)] flex-col border-r border-border bg-surface shadow-lg outline-none',
            'data-[state=open]:animate-sheet-in',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close navigation menu"
            className="absolute right-3 top-3.5 rounded-sm p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
          <SidebarBody user={user} pathname={pathname} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = useLocation().pathname

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href={`#${SKIP_TARGET_ID}`}
        className="sr-only rounded-sm bg-surface px-4 py-2 text-body-sm font-medium text-accent shadow-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-nav hidden w-sidebar border-r border-border bg-surface lg:block">
        <SidebarBody user={user} pathname={pathname} />
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-sidebar">
        {/* Slim sticky top bar — mobile chrome only; desktop keeps it for the theme toggle. */}
        <header className="sticky top-0 z-sticky flex h-header shrink-0 items-center gap-3 border-b border-border bg-canvas/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 sm:px-6 lg:justify-end">
          <div className="lg:hidden">
            <MobileDrawer user={user} pathname={pathname} />
          </div>
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="ml-auto lg:ml-0">
            <ThemeToggle />
          </div>
        </header>

        <main
          id={SKIP_TARGET_ID}
          tabIndex={-1}
          className="flex-1 px-4 py-5 outline-none sm:px-6 sm:py-6"
        >
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
    </div>
  )
}

/**
 * Page header block (DESIGN §5.4) — title on the left, contextual actions
 * (search, primary button) on the right. Rendered as the first child of each
 * page so it sits at the top of the content column, below the sticky top bar.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-h2 text-text-primary">{title}</h2>
        {description && <p className="mt-1 text-body-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
