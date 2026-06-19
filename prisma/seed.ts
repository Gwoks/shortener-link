/**
 * Seed demo data for QA fixtures (ARCHITECTURE.md §10.1). Creates a demo
 * email/password user and a spread of sample links exercising the states QA
 * verifies: active, password-protected, expired, max-clicks, and a guest link.
 * Idempotent — safe to re-run.
 */
import '../src/lib/load-env'
import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'demo-password-123'

async function main() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id })

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Demo User', passwordHash, emailVerified: new Date() },
  })

  const linkPasswordHash = await argon2.hash('secret', { type: argon2.argon2id })
  const now = Date.now()

  const links: Array<Parameters<typeof prisma.link.upsert>[0]['create']> = [
    {
      code: 'demo01',
      destinationUrl: 'https://example.com/welcome',
      ownerId: user.id,
      status: 'ACTIVE',
      metaStatus: 'READY',
      metaTitle: 'Example Domain',
      metaDescription: 'Illustrative destination for the demo dashboard.',
    },
    {
      code: 'demopw',
      aliasDisplay: 'demoPW',
      destinationUrl: 'https://example.com/protected',
      ownerId: user.id,
      status: 'ACTIVE',
      metaStatus: 'READY',
      metaTitle: 'Protected Page',
      passwordHash: linkPasswordHash,
    },
    {
      code: 'demoex',
      destinationUrl: 'https://example.com/expired',
      ownerId: user.id,
      status: 'ACTIVE',
      metaStatus: 'READY',
      // already expired by datetime → dead-link on visit (AC-20)
      expiresAt: new Date(now - 3600_000),
    },
    {
      code: 'demomx',
      destinationUrl: 'https://example.com/limited',
      ownerId: user.id,
      status: 'ACTIVE',
      metaStatus: 'READY',
      maxClicks: 1,
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

  console.log(`Seeded demo user (${DEMO_EMAIL} / ${DEMO_PASSWORD}) and ${links.length} sample links.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
