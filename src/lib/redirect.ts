/**
 * Pure redirect resolution rules (ARCHITECTURE.md §2.2.A). This is the
 * unit-tested core of the hot path: given a resolved link record + request
 * context, decide what the clicker gets. No I/O here — the route handler does
 * the cache/DB read and the click enqueue; this module only decides.
 *
 * Decision order (binding):
 *   not found            -> 404 dead-link  (never existed / deleted)
 *   deactivated          -> 410 dead-link
 *   expired (datetime)   -> 410 dead-link
 *   max-clicks reached   -> 410 dead-link
 *   password & unlocked? -> 200 gate page (no redirect, no click) if not unlocked
 *   otherwise            -> 30x redirect, click counted
 */

export type ResolvedLink = {
  id: string
  code: string
  destinationUrl: string
  status: 'ACTIVE' | 'EXPIRED' | 'DEACTIVATED'
  expiresAt: string | null // ISO-8601 UTC
  maxClicks: number | null
  clickCount: number
  hasPassword: boolean
}

export type RedirectContext = {
  /** Current time (ms since epoch) — injected so the core is deterministic. */
  now: number
  /** Does the request carry a valid unlock cookie/session for this code? */
  unlocked: boolean
  /**
   * Authoritative current click count for max-click enforcement. On the hot
   * path this comes from an atomic Redis counter; in tests it is supplied
   * directly. Falls back to the cached `clickCount` when undefined.
   */
  liveClickCount?: number
}

export type RedirectDecision =
  | { kind: 'redirect'; destination: string; counted: true }
  | { kind: 'gate'; status: 200 }
  | { kind: 'dead'; status: 410; reason: 'expired' | 'deactivated' | 'max-clicks' }
  | { kind: 'not-found'; status: 404 }

/** Resolve what a clicker receives. Pure. */
export function resolve(link: ResolvedLink | null, ctx: RedirectContext): RedirectDecision {
  if (!link) return { kind: 'not-found', status: 404 }

  if (link.status === 'DEACTIVATED') {
    return { kind: 'dead', status: 410, reason: 'deactivated' }
  }

  if (link.status === 'EXPIRED') {
    return { kind: 'dead', status: 410, reason: 'expired' }
  }

  if (link.expiresAt) {
    const exp = Date.parse(link.expiresAt)
    if (Number.isFinite(exp) && exp <= ctx.now) {
      return { kind: 'dead', status: 410, reason: 'expired' }
    }
  }

  if (link.maxClicks != null) {
    const current = ctx.liveClickCount ?? link.clickCount
    if (current >= link.maxClicks) {
      return { kind: 'dead', status: 410, reason: 'max-clicks' }
    }
  }

  if (link.hasPassword && !ctx.unlocked) {
    return { kind: 'gate', status: 200 }
  }

  return { kind: 'redirect', destination: link.destinationUrl, counted: true }
}

/**
 * Whether a *counted* hit just occurred (for click enqueue + INCR). Mirrors
 * `resolve`: only the `redirect` outcome counts (A-PWCOUNT — counts on the
 * post-unlock redirect, not on the gate render).
 */
export function isCountedHit(decision: RedirectDecision): boolean {
  return decision.kind === 'redirect'
}
