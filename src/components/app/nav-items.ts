/**
 * Authenticated shell nav config (DESIGN §4.7, USER-JOURNEY §2.2). Single source
 * for the sidebar + mobile drawer so the active state and order stay in sync.
 * Routes follow ARCHITECTURE §3.2.
 */
import { BarChart3, Layers, LinkIcon, Settings } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: typeof LinkIcon
  /** When true, only the exact path is "active" (used for the index route). */
  exact?: boolean
  /** Extra path prefixes that also mark this item active. */
  alsoMatches?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Links',
    icon: LinkIcon,
    exact: true,
    alsoMatches: ['/dashboard/links', '/dashboard/new'],
  },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/bulk', label: 'Bulk', icon: Layers },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** Whether a nav item is active for the current pathname. */
const isUnder = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(prefix + '/')

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.alsoMatches?.some((prefix) => isUnder(pathname, prefix))) return true
  return item.exact ? pathname === item.href : isUnder(pathname, item.href)
}
