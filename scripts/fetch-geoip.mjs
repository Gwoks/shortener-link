#!/usr/bin/env node
/**
 * Provision the MaxMind GeoLite2-City database (ARCHITECTURE.md §10.3, NFR-11).
 *
 * Usage:
 *   MAXMIND_LICENSE_KEY=xxxx pnpm fetch:geoip
 *
 * Requires a FREE MaxMind account/license key. If you cannot use a key, a
 * maintainer may instead drop the file manually at data/GeoLite2-City.mmdb.
 * If the key is absent, this script prints instructions and exits 0 (non-fatal):
 * the app still runs, geo enrichment just degrades to null until the DB exists
 * (AC-12 requires it present, so provision it once before the QA geo check).
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const TARGET = join(DATA_DIR, 'GeoLite2-City.mmdb')

const key = process.env.MAXMIND_LICENSE_KEY

if (!key) {
  console.log(
    [
      'MAXMIND_LICENSE_KEY is not set.',
      '',
      'GeoLite2-City.mmdb is needed for geo analytics (AC-12). To provision it:',
      '  1. Create a free MaxMind account: https://www.maxmind.com/en/geolite2/signup',
      '  2. Generate a license key and set MAXMIND_LICENSE_KEY in your .env',
      '  3. Re-run: pnpm fetch:geoip',
      '',
      'Alternatively, drop the file manually at data/GeoLite2-City.mmdb.',
      '',
      'Skipping download (the app runs without it; geo will be null until present).',
    ].join('\n'),
  )
  process.exit(0)
}

if (existsSync(TARGET)) {
  console.log(`GeoLite2-City.mmdb already present at ${TARGET}; nothing to do.`)
  process.exit(0)
}

mkdirSync(DATA_DIR, { recursive: true })

const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${key}&suffix=tar.gz`
const tarball = join(DATA_DIR, 'GeoLite2-City.tar.gz')

console.log('Downloading GeoLite2-City…')
const res = await fetch(url)
if (!res.ok || !res.body) {
  console.error(`Download failed: HTTP ${res.status}. Check your license key.`)
  process.exit(1)
}
await pipeline(res.body, createWriteStream(tarball))

console.log('Extracting…')
// Extract with the system tar into a temp dir, then move the .mmdb into place.
const extractDir = join(DATA_DIR, '_geoip_extract')
rmSync(extractDir, { recursive: true, force: true })
mkdirSync(extractDir, { recursive: true })
execFileSync('tar', ['-xzf', tarball, '-C', extractDir])

// The archive contains a dated subdir holding GeoLite2-City.mmdb.
let found = null
for (const entry of readdirSync(extractDir)) {
  const sub = join(extractDir, entry)
  if (statSync(sub).isDirectory()) {
    const candidate = join(sub, 'GeoLite2-City.mmdb')
    if (existsSync(candidate)) {
      found = candidate
      break
    }
  }
}
if (!found) {
  console.error('Could not locate GeoLite2-City.mmdb inside the archive.')
  process.exit(1)
}
copyFileSync(found, TARGET)
rmSync(extractDir, { recursive: true, force: true })
rmSync(tarball, { force: true })
console.log(`Done. GeoLite2-City.mmdb installed at ${TARGET}`)
