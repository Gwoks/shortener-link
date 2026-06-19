/**
 * Session helpers for route handlers (ARCHITECTURE.md §4.1). Re-checks
 * authorization server-side (never trusts middleware alone).
 */
import { auth } from './auth'
import { ApiError } from './errors'

/** Returns the current user id or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/** Returns the current user id or throws UNAUTHENTICATED (for S routes). */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId()
  if (!id) throw new ApiError('UNAUTHENTICATED')
  return id
}
