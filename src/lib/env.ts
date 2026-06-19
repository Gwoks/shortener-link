/**
 * Centralized, typed environment access (ARCHITECTURE.md §10.5).
 * Defaults keep the app runnable locally with `docker-compose up` and make the
 * pure modules importable in tests without a full `.env`.
 */

function str(name: string, fallback: string): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function int(name: string, fallback: number): number {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  get databaseUrl() {
    return str('DATABASE_URL', 'postgresql://shortener:shortener@localhost:5432/shortener')
  },
  get redisUrl() {
    return str('REDIS_URL', 'redis://localhost:6379/0')
  },
  get nextAuthSecret() {
    return str('NEXTAUTH_SECRET', 'dev-only-insecure-secret-change-me-please-32b')
  },
  get baseUrl() {
    return str('BASE_URL', str('NEXTAUTH_URL', 'http://localhost:3000')).replace(/\/$/, '')
  },
  get visitorIpPepper() {
    return str('VISITOR_IP_PEPPER', 'dev-only-pepper-change-me')
  },
  get geoipDbPath() {
    return str('GEOIP_DB_PATH', 'data/GeoLite2-City.mmdb')
  },
  get googleClientId() {
    return str('GOOGLE_CLIENT_ID', '')
  },
  get googleClientSecret() {
    return str('GOOGLE_CLIENT_SECRET', '')
  },
  get githubClientId() {
    return str('GITHUB_CLIENT_ID', '')
  },
  get githubClientSecret() {
    return str('GITHUB_CLIENT_SECRET', '')
  },

  // Redirect / lifecycle
  get redirectStatus(): 301 | 302 {
    return int('REDIRECT_STATUS', 302) === 301 ? 301 : 302
  },
  get redirectCacheTtl() {
    return int('REDIRECT_CACHE_TTL', 3600)
  },
  get redirectNegativeCacheTtl() {
    return int('REDIRECT_NEGATIVE_CACHE_TTL', 60)
  },
  get clickRetentionDays() {
    return int('CLICK_RETENTION_DAYS', 400)
  },
  get guestTtlHours() {
    return int('GUEST_TTL_HOURS', 24)
  },
  get bulkMax() {
    return int('BULK_MAX', 100)
  },
  get unlockSessionTtlSec() {
    return int('UNLOCK_SESSION_TTL_SEC', 1800)
  },
  get clickStreamMaxLen() {
    return int('CLICK_STREAM_MAXLEN', 100_000)
  },

  // Rate limiting
  get rlShorten() {
    return {
      capacity: int('RL_SHORTEN_CAPACITY', 20),
      refill: int('RL_SHORTEN_REFILL', 20),
      windowSec: int('RL_SHORTEN_WINDOW_SEC', 60),
    }
  },
  get rlUnlock() {
    return {
      capacity: int('RL_UNLOCK_CAPACITY', 5),
      refill: int('RL_UNLOCK_REFILL', 5),
      windowSec: int('RL_UNLOCK_WINDOW_SEC', 300),
      lockoutSec: int('RL_UNLOCK_LOCKOUT_SEC', 900),
    }
  },

  get isProd() {
    return process.env.NODE_ENV === 'production'
  },
}

export type Env = typeof env
