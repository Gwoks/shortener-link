/**
 * GET    /api/links/{id}  (S) — fetch one owned link.
 * PATCH  /api/links/{id}  (S) — edit; invalidates redirect cache (FR-21/AC-28).
 * DELETE /api/links/{id}  (S) — delete; cascades analytics, evicts cache (AC-29).
 * ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { patchLinkSchema } from '@/lib/validation/link'
import { requireUserId } from '@/lib/session'
import { ApiError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { serializeLink } from '@/lib/serialize'
import { invalidateRedirect, resetClickCount } from '@/lib/cache'
import { normalizeAlias, validateAliasSyntax } from '@/lib/alias'
import { codeExists, freeSuggestions } from '@/lib/links-service'
import { hashPassword } from '@/lib/hash'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

async function loadOwned(id: string, userId: string) {
  const link = await prisma.link.findUnique({ where: { id } })
  if (!link) throw new ApiError('NOT_FOUND')
  if (link.ownerId !== userId) throw new ApiError('FORBIDDEN')
  return link
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId()
    const link = await loadOwned(params.id, userId)
    return NextResponse.json({ link: serializeLink(link) })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId()
    const existing = await loadOwned(params.id, userId)
    const input = await parseJson(req, patchLinkSchema)

    const data: Prisma.LinkUpdateInput = {}
    let newCode: string | null = null

    if (input.destinationUrl !== undefined) data.destinationUrl = input.destinationUrl
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt
    if (input.maxClicks !== undefined) data.maxClicks = input.maxClicks
    if (input.status !== undefined) data.status = input.status

    if (input.password !== undefined) {
      data.passwordHash = input.password === null ? null : await hashPassword(input.password)
    }

    if (input.alias !== undefined) {
      const syntax = validateAliasSyntax(input.alias)
      if (!syntax.ok) {
        throw new ApiError(syntax.reason === 'reserved' ? 'ALIAS_RESERVED' : 'VALIDATION_ERROR', {
          field: 'alias',
          message: syntax.message,
        })
      }
      const lower = normalizeAlias(input.alias)
      if (lower !== existing.code && (await codeExists(lower))) {
        throw new ApiError('ALIAS_TAKEN', { field: 'alias', suggestions: await freeSuggestions(input.alias) })
      }
      data.code = lower
      data.aliasDisplay = input.alias.trim()
      newCode = lower
    }

    let updated
    try {
      updated = await prisma.link.update({ where: { id: existing.id }, data })
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === 'P2002') {
        throw new ApiError('ALIAS_TAKEN', { field: 'alias' })
      }
      throw err
    }

    // Cache invalidation (FR-21, AC-28): evict old code and the new one, and
    // reset the max-click counter so a changed cap takes effect immediately.
    await invalidateRedirect(existing.code)
    await resetClickCount(existing.code)
    if (newCode && newCode !== existing.code) {
      await invalidateRedirect(newCode)
      await resetClickCount(newCode)
    }

    return NextResponse.json({ link: serializeLink(updated) })
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId()
    const link = await loadOwned(params.id, userId)
    // Cascade removes ClickEvent/ClickRollup (schema onDelete: Cascade, AC-14/29).
    await prisma.link.delete({ where: { id: link.id } })
    await invalidateRedirect(link.code)
    await resetClickCount(link.code)
    return new NextResponse(null, { status: 204 })
  })
}
