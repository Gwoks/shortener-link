/**
 * GeoIP enrichment via a locally-bundled MaxMind GeoLite2-City DB
 * (ARCHITECTURE.md §4.6, FR-6, NFR-11, AC-12). Offline, no paid API. Degrades
 * gracefully to {country:null, city:null} if the DB file is absent so the app
 * still runs (the DB is provisioned once for full AC-12 coverage). Used only by
 * the worker.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { env } from './env'

export interface GeoResult {
  country: string | null
  city: string | null
}

const EMPTY: GeoResult = { country: null, city: null }

// maxmind's Reader type; loaded lazily.
let reader: { get: (ip: string) => unknown } | null = null
let loadAttempted = false

async function getReader(): Promise<{ get: (ip: string) => unknown } | null> {
  if (loadAttempted) return reader
  loadAttempted = true
  const dbPath = join(process.cwd(), env.geoipDbPath)
  if (!existsSync(dbPath)) {
    console.warn(`[geo] GeoLite2 DB not found at ${dbPath}; geo enrichment disabled.`)
    return null
  }
  try {
    const maxmind = await import('maxmind')
    reader = await maxmind.open(dbPath)
    return reader
  } catch (err) {
    console.warn('[geo] failed to open GeoLite2 DB:', (err as Error).message)
    return null
  }
}

/** Look up country/city for an IP. Never throws. */
export async function geoLookup(ip: string | null | undefined): Promise<GeoResult> {
  if (!ip) return EMPTY
  const r = await getReader()
  if (!r) return EMPTY
  try {
    const rec = r.get(ip) as
      | { country?: { iso_code?: string; names?: { en?: string } }; city?: { names?: { en?: string } } }
      | null
    if (!rec) return EMPTY
    return {
      country: rec.country?.iso_code ?? rec.country?.names?.en ?? null,
      city: rec.city?.names?.en ?? null,
    }
  } catch {
    return EMPTY
  }
}
