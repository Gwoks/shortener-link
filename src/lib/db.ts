/**
 * Prisma client singleton (ARCHITECTURE.md §7). Reused across hot reloads in
 * dev to avoid exhausting connections. NOTE: the redirect hot path must NOT
 * import this on a cache hit (§8.1) — it is used by the API/worker and only by
 * the redirect path on a cache miss.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
