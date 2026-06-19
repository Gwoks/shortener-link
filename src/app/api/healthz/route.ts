/**
 * GET /api/healthz  (P) — liveness/readiness for docker-compose healthcheck and
 * QA smoke (AC-52). Reports DB + Redis connectivity. ARCHITECTURE.md §6.2.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { redisHealthy } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  } catch {
    db = false
  }
  const redis = await redisHealthy()
  const status = db && redis ? 'ok' : 'degraded'
  return NextResponse.json({ status, db, redis }, { status: db && redis ? 200 : 503 })
}
