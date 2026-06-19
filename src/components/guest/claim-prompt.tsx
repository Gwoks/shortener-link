'use client'

/**
 * Guest-claim prompt (DESIGN §5.10, USER-JOURNEY Journey F / §4.10, FR-34, AC-42).
 * After sign-up / first sign-in, if this browser still holds live guest links it
 * offers to claim them into the account (explicit opt-in). On mount it calls
 * GET /api/guest-links/claimable; if any are returned it opens a modal listing
 * them (code + destination + remaining TTL) with "Claim N links" (primary) /
 * "Not now" (ghost). Claiming POSTs to /api/guest-links/claim — the links lose
 * their 24h expiry and join the account (a toast confirms, then the dashboard
 * refreshes to show them).
 *
 * Self-contained and non-blocking: it renders nothing (and never throws to the
 * parent) when there's nothing to claim, so it can be dropped onto the dashboard
 * without affecting its other states. "Not now" is remembered for the session so
 * it doesn't re-prompt on every dashboard visit.
 */
import { ExternalLink, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '../lib/api'
import { displayDestination, relativeTime } from '../lib/format'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { useToast } from '../ui/toast'

const DISMISS_KEY = 'tess-claim-dismissed'

export function GuestClaimPrompt({
  /** Called after a successful claim so the parent can refetch its list. */
  onClaimed,
}: {
  onClaimed?: (claimed: number) => void
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()

  const [links, setLinks] = useState<LinkResource[]>([])
  const [open, setOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  // Guard against double-fetch in React 18 StrictMode dev double-invoke.
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true

    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') {
      return
    }

    let active = true
    api
      .claimable()
      .then((res) => {
        if (!active) return
        if (res.links.length > 0) {
          setLinks(res.links)
          setOpen(true)
        }
      })
      .catch(() => {
        /* silent: a missing guest cookie or any error simply means nothing to claim */
      })
    return () => {
      active = false
    }
  }, [])

  const remember = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage unavailable — fine */
    }
  }

  const handleDecline = () => {
    remember()
    setOpen(false)
  }

  const handleClaim = async () => {
    setClaiming(true)
    try {
      const { claimed } = await api.claim(links.map((l) => l.id))
      remember()
      setOpen(false)
      success(
        claimed === 1 ? 'Link claimed' : `${claimed} links claimed`,
        'They’re now in your account and no longer expire.',
      )
      onClaimed?.(claimed)
      // Refresh so the dashboard list reflects the newly owned links.
      router.refresh()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not claim your links. Please try again.'
      toastError('Couldn’t claim links', message)
    } finally {
      setClaiming(false)
    }
  }

  if (links.length === 0) return null

  const count = links.length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing via Escape / scrim is treated as "Not now".
        if (!next) handleDecline()
        else setOpen(true)
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
              Keep your recent links?
            </span>
          </DialogTitle>
          <DialogDescription>
            You created {count === 1 ? 'this link' : `these ${count} links`} before signing in. Claim{' '}
            {count === 1 ? 'it' : 'them'} to keep {count === 1 ? 'it' : 'them'} permanently — the 24-hour
            expiry is removed.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-subtle px-3 py-2"
              >
                <div className="min-w-0">
                  <a
                    href={link.shortUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-mono text-body-sm font-medium text-text-primary hover:text-accent"
                    title={link.shortUrl}
                  >
                    <span className="truncate">{displayDestination(link.shortUrl)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <p className="truncate font-mono text-caption text-text-tertiary" title={link.destinationUrl}>
                    {displayDestination(link.destinationUrl)}
                  </p>
                </div>
                {link.expiresAt && (
                  <span className="shrink-0 whitespace-nowrap text-caption text-warning-fg">
                    expires {relativeTime(link.expiresAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleDecline} disabled={claiming}>
            Not now
          </Button>
          <Button type="button" onClick={handleClaim} loading={claiming}>
            {count === 1 ? 'Claim link' : `Claim ${count} links`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
