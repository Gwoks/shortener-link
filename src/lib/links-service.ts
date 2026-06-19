/**
 * Link resolution + creation service (ARCHITECTURE.md §2.2.A/C). Shared by the
 * redirect hot path (cache-miss read + warm) and the create API. Keeps the
 * DB/cache orchestration in one place; pure rules live in redirect.ts/alias.ts.
 */
import type { Link } from '@prisma/client'
import { prisma } from './db'
import { getRedirect, setRedirect, setDead, type CacheLookup } from './cache'
import { toResolvedLink } from './serialize'
import { generateUniqueCode } from './shortcode'
import { normalizeAlias, validateAliasSyntax, suggestAliases } from './alias'
import { isUrlBlocked } from './blocklist'
import { assembleUtmUrl, type UtmParams } from './utm'
import { hashPassword } from './hash'
import { ApiError } from './errors'
import type { ResolvedLink } from './redirect'

/** True if a code (lowercased) already exists. Used by collision retry + alias. */
export async function codeExists(codeLower: string): Promise<boolean> {
  const found = await prisma.link.findUnique({ where: { code: codeLower }, select: { id: true } })
  return found !== null
}

/**
 * Resolve a code to a `ResolvedLink` for the redirect path: try cache, then DB
 * on miss, warming the cache (positive or negative). Returns null for
 * not-found/dead, plus a flag indicating it came from a negative cache hit.
 */
export async function resolveForRedirect(
  code: string,
): Promise<{ link: ResolvedLink | null; cache: CacheLookup['state'] }> {
  const cached = await getRedirect(code)
  if (cached.state === 'hit') return { link: cached.link, cache: 'hit' }
  if (cached.state === 'dead') return { link: null, cache: 'dead' }

  // Miss — consult Postgres.
  const row = await prisma.link.findUnique({ where: { code: normalizeAlias(code) } })
  if (!row) {
    // Truly not-found → negative cache so repeated hits don't hammer the DB.
    // (Only a genuinely missing code is negatively cached; EXPIRED/DEACTIVATED
    // rows are cached as resolved records below so the route can render the
    // on-brand 410 dead-link, NOT a 404 — see resolve() rules.)
    await setDead(code)
    return { link: null, cache: 'miss' }
  }
  // Cache and return the resolved record regardless of lifecycle status. The
  // pure resolve() decides 302 (ACTIVE) vs 410 (EXPIRED/DEACTIVATED/expired-by-
  // datetime/max-clicks). This preserves the not-found(404) vs dead(410)
  // distinction the architecture requires (A-DEADLINK).
  const resolved = toResolvedLink(row)
  await setRedirect(resolved)
  return { link: resolved, cache: 'miss' }
}

export interface CreateLinkArgs {
  url: string
  alias?: string
  expiresAt?: Date | null
  maxClicks?: number | null
  password?: string | null
  utm?: UtmParams | null
  ownerId: string | null
  isGuest: boolean
  guestKey?: string | null
  guestTtlHours?: number
}

/**
 * Create a link: assemble UTM, run the inbound blocklist, resolve the alias or
 * generate a unique code, hash any password, and insert. Throws ApiError with
 * the canonical code on validation/availability failures (§6.2).
 */
export async function createLink(args: CreateLinkArgs): Promise<Link> {
  const destinationUrl = assembleUtmUrl(args.url, args.utm)

  // Inbound trust boundary (FR-36, AC-44) — distinct from outbound SSRF.
  if (isUrlBlocked(destinationUrl)) {
    throw new ApiError('URL_BLOCKED')
  }

  let code: string
  let aliasDisplay: string | null = null

  if (args.alias && args.alias.trim() !== '') {
    const syntax = validateAliasSyntax(args.alias)
    if (!syntax.ok) {
      throw new ApiError(syntax.reason === 'reserved' ? 'ALIAS_RESERVED' : 'VALIDATION_ERROR', {
        field: 'alias',
        message: syntax.message,
      })
    }
    const lower = normalizeAlias(args.alias)
    if (await codeExists(lower)) {
      throw new ApiError('ALIAS_TAKEN', { field: 'alias', suggestions: await freeSuggestions(args.alias) })
    }
    code = lower
    aliasDisplay = args.alias.trim()
  } else {
    code = (await generateUniqueCode({ exists: codeExists })).toLowerCase()
  }

  const passwordHash = args.password ? await hashPassword(args.password) : null

  let guestExpiry: Date | null = args.expiresAt ?? null
  if (args.isGuest && !guestExpiry) {
    const hours = args.guestTtlHours ?? 24
    guestExpiry = new Date(Date.now() + hours * 3600 * 1000)
  }

  try {
    return await prisma.link.create({
      data: {
        code,
        aliasDisplay,
        destinationUrl,
        ownerId: args.ownerId,
        isGuest: args.isGuest,
        guestKey: args.guestKey ?? null,
        passwordHash,
        expiresAt: guestExpiry,
        maxClicks: args.maxClicks ?? null,
        status: 'ACTIVE',
        metaStatus: 'PENDING',
      },
    })
  } catch (err: unknown) {
    // Unique constraint race on code — surface as ALIAS_TAKEN for aliases or
    // retry once for generated codes.
    if (isUniqueViolation(err)) {
      if (aliasDisplay) {
        throw new ApiError('ALIAS_TAKEN', { field: 'alias', suggestions: await freeSuggestions(aliasDisplay) })
      }
      const retryCode = (await generateUniqueCode({ exists: codeExists })).toLowerCase()
      return prisma.link.create({
        data: {
          code: retryCode,
          destinationUrl,
          ownerId: args.ownerId,
          isGuest: args.isGuest,
          guestKey: args.guestKey ?? null,
          passwordHash,
          expiresAt: guestExpiry,
          maxClicks: args.maxClicks ?? null,
          status: 'ACTIVE',
          metaStatus: 'PENDING',
        },
      })
    }
    throw err
  }
}

/** Generate alias suggestions that are actually free in the DB (AC-4). */
export async function freeSuggestions(base: string): Promise<string[]> {
  const candidates = suggestAliases(base)
  const free: string[] = []
  for (const c of candidates) {
    if (!(await codeExists(normalizeAlias(c)))) free.push(c)
    if (free.length >= 3) break
  }
  return free
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}
