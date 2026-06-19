'use client'

/**
 * Theme toggle (DESIGN §4.12, FR-41, AC-46). Segmented System / Light / Dark
 * control bound to the ThemeProvider preference; persists to localStorage and
 * reflects the resolved theme. Each option is a real focusable button (via the
 * Segmented primitive). Icon-only labels carry an `ariaLabel`.
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { Segmented, type SegmentedOption } from '../ui/segmented'
import { useTheme, type ThemePreference } from '../theme/theme'

const OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: <Monitor className="h-4 w-4" aria-hidden="true" />, ariaLabel: 'System theme' },
  { value: 'light', label: <Sun className="h-4 w-4" aria-hidden="true" />, ariaLabel: 'Light theme' },
  { value: 'dark', label: <Moon className="h-4 w-4" aria-hidden="true" />, ariaLabel: 'Dark theme' },
]

export function ThemeToggle({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const { preference, setPreference } = useTheme()
  return (
    <Segmented
      ariaLabel="Color theme"
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      size={size}
      className={className}
    />
  )
}
