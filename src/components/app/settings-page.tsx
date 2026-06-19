'use client'

/**
 * Settings screen (DESIGN §5.11, FR-41, AC-46 + account). A quiet, single-column
 * page (max-width ~640px) with three sections:
 *  - Appearance: the System/Light/Dark theme toggle (reuses ThemeToggle, AC-46).
 *  - Account: signed-in name/email + sign out.
 *  - Privacy & data: a transparent note reflecting the A-PII stance — visitor IPs
 *    are hashed + truncated (never stored raw) and click events have a finite
 *    retention window — so the product is honest about what it keeps.
 *
 * Client component: it owns the interactive theme toggle and sign-out; account
 * identity is passed in from the server route's session (never trusts the client).
 */
import { LogOut, Palette, ShieldCheck, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { signOut } from 'next-auth/react'
import { PageHeader } from './app-shell'
import { ThemeToggle } from './theme-toggle'
import { Avatar } from './avatar'
import { Button } from '../ui/button'

/** Default click-event retention window (ARCHITECTURE §4.6, env CLICK_RETENTION_DAYS). */
const RETENTION_DAYS = 400

export interface SettingsUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-text-secondary"
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-h4 text-text-primary">{title}</h3>
          {description && <p className="mt-0.5 text-body-sm text-text-secondary">{description}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function SettingsPage({ user }: { user: SettingsUser }) {
  const [signingOut, setSigningOut] = useState(false)
  const displayName = user.name || user.email || 'Your account'

  const onSignOut = useCallback(() => {
    setSigningOut(true)
    void signOut({ callbackUrl: '/' })
  }, [])

  return (
    <div>
      <PageHeader title="Settings" description="Manage your appearance, account, and data preferences." />

      <div className="mx-auto w-full max-w-xl space-y-5">
        {/* Appearance */}
        <Section
          icon={Palette}
          title="Appearance"
          description="Choose how Tess looks. System follows your device setting."
        >
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <span className="text-caption text-text-tertiary">Your choice is saved on this device.</span>
          </div>
        </Section>

        {/* Account */}
        <Section icon={UserRound} title="Account" description="You’re signed in to Tess.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={user.name} email={user.email} image={user.image} />
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium text-text-primary">{displayName}</p>
                {user.email && user.name && (
                  <p className="truncate text-caption text-text-tertiary">{user.email}</p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onSignOut}
              loading={signingOut}
              className="shrink-0"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </Section>

        {/* Privacy & data */}
        <Section
          icon={ShieldCheck}
          title="Privacy & data"
          description="How Tess handles visitor analytics data."
        >
          <ul className="space-y-3 text-body-sm text-text-secondary">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" aria-hidden="true" />
              <span>
                Visitor IP addresses are <strong className="font-medium text-text-primary">hashed and
                truncated</strong> before storage (IPv4 to /24, IPv6 to /48, with a server-side pepper).
                Raw IP addresses are never stored or logged.
              </span>
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" aria-hidden="true" />
              <span>
                Unique-visitor counts use a privacy-preserving key — a first-party cookie when
                available, otherwise a hash of the truncated IP and browser — not a personal identifier.
              </span>
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" aria-hidden="true" />
              <span>
                Individual click events are kept for a finite window (about{' '}
                <strong className="font-medium text-text-primary">{RETENTION_DAYS} days</strong> by
                default) and then removed; only aggregated totals are retained longer.
              </span>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
