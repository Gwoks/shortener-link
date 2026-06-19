/**
 * Serialize a Link DB row to the client resource shape (ARCHITECTURE.md §6.1).
 * `passwordHash` is NEVER serialized — only `hasPassword: boolean`.
 */
import type { Link } from '@prisma/client'
import { env } from './env'
import type { ResolvedLink } from './redirect'

export interface LinkResource {
  id: string
  code: string
  shortUrl: string
  destinationUrl: string
  status: Link['status']
  metaStatus: Link['metaStatus']
  metaTitle: string | null
  metaDescription: string | null
  hasPassword: boolean
  expiresAt: string | null
  maxClicks: number | null
  clickCount: number
  isGuest: boolean
  createdAt: string
  updatedAt: string
}

export function shortUrlForCode(code: string): string {
  return `${env.baseUrl}/${code}`
}

export function serializeLink(link: Link): LinkResource {
  // Prefer the original-case alias for display when present.
  const displayCode = link.aliasDisplay ?? link.code
  return {
    id: link.id,
    code: displayCode,
    shortUrl: shortUrlForCode(displayCode),
    destinationUrl: link.destinationUrl,
    status: link.status,
    metaStatus: link.metaStatus,
    metaTitle: link.metaTitle,
    metaDescription: link.metaDescription,
    hasPassword: link.passwordHash != null,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    maxClicks: link.maxClicks,
    clickCount: link.clickCount,
    isGuest: link.isGuest,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }
}

/** Build the minimal resolved record cached for the hot path (§8.1). */
export function toResolvedLink(link: Link): ResolvedLink {
  return {
    id: link.id,
    code: link.code,
    destinationUrl: link.destinationUrl,
    status: link.status,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    maxClicks: link.maxClicks,
    clickCount: link.clickCount,
    hasPassword: link.passwordHash != null,
  }
}
