/**
 * Seed demo data for QA fixtures (ARCHITECTURE.md §10.1). Creates sample
 * accounts — one ADMIN and regular USERs — plus a spread of sample links
 * exercising the states QA verifies: active, password-protected, expired,
 * max-clicks, and a guest link. Idempotent — safe to re-run.
 */
import '../src/lib/load-env'
import { PrismaClient, type Role } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

/** Sample accounts seeded for local/dev use (NOT for production). */
const ACCOUNTS: Array<{ email: string; password: string; name: string; role: Role }> = [
  { email: 'admin@example.com', password: 'admin-password-123', name: 'Admin User', role: 'ADMIN' },
  { email: 'user@example.com', password: 'user-password-123', name: 'Regular User', role: 'USER' },
  { email: 'demo@example.com', password: 'demo-password-123', name: 'Demo User', role: 'USER' },
]

async function main() {
  const byEmail: Record<string, { id: string }> = {}
  for (const acct of ACCOUNTS) {
    const passwordHash = await argon2.hash(acct.password, { type: argon2.argon2id })
    byEmail[acct.email] = await prisma.user.upsert({
      where: { email: acct.email },
      update: { role: acct.role },
      create: {
        email: acct.email,
        name: acct.name,
        role: acct.role,
        passwordHash,
        emailVerified: new Date(),
      },
    })
  }

  const demoId = byEmail['demo@example.com'].id
  const adminId = byEmail['admin@example.com'].id
  const linkPasswordHash = await argon2.hash('secret', { type: argon2.argon2id })
  const now = Date.now()

  const links: Array<Parameters<typeof prisma.link.upsert>[0]['create']> = [
    {
      code: 'demo01',
      destinationUrl: 'https://example.com/welcome',
      ownerId: demoId,
      status: 'ACTIVE',
      metaStatus: 'READY',
      metaTitle: 'Example Domain',
      metaDescription: 'Illustrative destination for the demo dashboard.',
    },
    {
      code: 'demopw',
      aliasDisplay: 'demoPW',
      destinationUrl: 'https://example.com/protected',
      ownerId: demoId,
      status: 'ACTIVE',
      metaStatus: 'READY',
      metaTitle: 'Protected Page',
      passwordHash: linkPasswordHash,
    },
    {
      code: 'demoex',
      destinationUrl: 'https://example.com/expired',
      ownerId: demoId,
      status: 'ACTIVE',
      metaStatus: 'READY',
      // already expired by datetime → dead-link on visit (AC-20)
      expiresAt: new Date(now - 3600_000),
    },
    {
      code: 'demomx',
      destinationUrl: 'https://example.com/limited',
      ownerId: demoId,
      status: 'ACTIVE',
      metaStatus: 'READY',
      maxClicks: 1,
    },
    {
      code: 'admin1',
      destinationUrl: 'https://example.com/admin-resource',
      ownerId: adminId,
      status: 'ACTIVE',
      metaStatus: 'READY',
      metaTitle: "Admin's link",
    },
    {
      code: 'guest1',
      destinationUrl: 'https://example.com/guest',
      ownerId: null,
      isGuest: true,
      guestKey: 'seed-guest-key',
      status: 'ACTIVE',
      metaStatus: 'PENDING',
      expiresAt: new Date(now + 24 * 3600_000),
    },
  ]

  for (const create of links) {
    await prisma.link.upsert({ where: { code: create.code }, update: {}, create })
  }

  console.log('Seeded accounts (email / password — role):')
  for (const a of ACCOUNTS) console.log(`  ${a.email}  /  ${a.password}   — ${a.role}`)
  console.log(`Seeded ${links.length} sample links.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
