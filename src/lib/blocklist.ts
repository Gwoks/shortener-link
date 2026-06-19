/**
 * Inbound (create-time) phishing/malware blocklist (ARCHITECTURE.md §4.5,
 * FR-36, AC-44). Offline newline-delimited host file loaded once into an
 * in-memory set. This is the INBOUND boundary — entirely separate from the
 * outbound SSRF guard (lib/ssrf.ts). Pure matching logic is exported and tested
 * independently of file loading.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let cachedSet: Set<string> | null = null

/** Parse blocklist file text into a normalized host set. Pure. */
export function parseBlocklist(text: string): Set<string> {
  const set = new Set<string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    set.add(normalizeHost(trimmed))
  }
  return set
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
}

function loadSet(): Set<string> {
  if (cachedSet) return cachedSet
  const path = join(process.cwd(), 'data', 'blocklist.txt')
  if (existsSync(path)) {
    try {
      cachedSet = parseBlocklist(readFileSync(path, 'utf8'))
      return cachedSet
    } catch {
      /* fall through to empty set */
    }
  }
  cachedSet = new Set()
  return cachedSet
}

/**
 * Pure: is the given URL's host (or a parent domain) in the blocklist set?
 * Matches the exact host and any parent domain (so `evil.com` blocks
 * `sub.evil.com`).
 */
export function isHostBlocked(rawUrl: string, set: Set<string>): boolean {
  let host: string
  try {
    host = normalizeHost(new URL(rawUrl).hostname)
  } catch {
    return false // malformed URLs are rejected earlier by validation, not here
  }
  if (set.has(host)) return true
  // Walk parent domains.
  const parts = host.split('.')
  for (let i = 1; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true
  }
  return false
}

/** Convenience wrapper using the loaded file-backed set. */
export function isUrlBlocked(rawUrl: string): boolean {
  return isHostBlocked(rawUrl, loadSet())
}

/** Test/seed hook to inject a set (resets the file-backed cache). */
export function __setBlocklistForTest(set: Set<string> | null): void {
  cachedSet = set
}
