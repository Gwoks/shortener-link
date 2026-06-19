/**
 * User-agent → device type + browser (ARCHITECTURE.md §5.1, FR-7).
 * Uses ua-parser-js with a light bot heuristic. Returns coarse, privacy-safe
 * buckets only (no fingerprinting).
 */
import { UAParser } from 'ua-parser-js'

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot'

export interface UaResult {
  deviceType: DeviceType
  browser: string | null
}

const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|curl|wget|python-requests|go-http/i

export function parseUserAgent(ua: string | null | undefined): UaResult {
  if (!ua || ua.trim() === '') return { deviceType: 'desktop', browser: null }
  if (BOT_PATTERN.test(ua)) return { deviceType: 'bot', browser: null }

  const parser = new UAParser(ua)
  const device = parser.getDevice()
  const browser = parser.getBrowser()

  let deviceType: DeviceType
  switch (device.type) {
    case 'mobile':
      deviceType = 'mobile'
      break
    case 'tablet':
      deviceType = 'tablet'
      break
    default:
      deviceType = 'desktop'
  }

  return { deviceType, browser: browser.name ?? null }
}
