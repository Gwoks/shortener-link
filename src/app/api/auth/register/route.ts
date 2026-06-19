/**
 * POST /api/auth/register  (P) — email/password sign-up (FR-27, AC-35).
 * Body { email, password, name? }. argon2id-hashes the password; the client
 * then signs in via Credentials. 409 EMAIL_TAKEN if the email exists.
 * ARCHITECTURE.md §6.2.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { handle, parseJson } from '@/lib/route-helpers'
import { registerSchema } from '@/lib/validation/link'
import { ApiError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/hash'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { email, password, name } = await parseJson(req, registerSchema)
    const normalizedEmail = email.toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
    if (existing) throw new ApiError('EMAIL_TAKEN')

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email: normalizedEmail, name: name ?? null, passwordHash },
      select: { id: true, email: true, name: true },
    })

    return NextResponse.json({ user }, { status: 201 })
  })
}
