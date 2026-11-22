/**
 * Design tokens from the root DESIGN.md ("Notion" warm-paper system).
 *
 * Single source of truth for the token *names* consumed by both
 * tailwind.config.ts (to generate utilities) and lib/cn.ts (so tailwind-merge
 * can tell our custom `text-<size>` and `text-<color>` classes apart). Raw hex
 * values live once, as CSS custom properties in globals.css.
 */

interface FontSizeOptions {
  lineHeight: string
  fontWeight?: string
  letterSpacing?: string
}

type FontSizeToken = [size: string, options: FontSizeOptions]

/** DESIGN.md §Type Scale, plus three app-UI roles (eyebrow, title, mono-lg). */
export const FONT_SIZE = {
  caption: ['12px', { lineHeight: '1.33', fontWeight: '500', letterSpacing: '0.12px' }],
  eyebrow: ['12px', { lineHeight: '1.33', fontWeight: '600', letterSpacing: '0.04em' }],
  'body-sm': ['14px', { lineHeight: '1.43' }],
  body: ['16px', { lineHeight: '1.5' }],
  title: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
  'mono-lg': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
  /** Editorial serif subhead (Lyon Text → Source Serif 4), 18px / 1.56. */
  lede: ['18px', { lineHeight: '1.56' }],
  subheading: ['20px', { lineHeight: '1.2', fontWeight: '600' }],
  'heading-sm': ['22px', { lineHeight: '1.27', fontWeight: '600', letterSpacing: '-0.242px' }],
  heading: ['40px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.036em' }],
  'heading-lg': ['48px', { lineHeight: '1.14', fontWeight: '700', letterSpacing: '-0.036em' }],
  'display-sm': ['54px', { lineHeight: '1.04', fontWeight: '700', letterSpacing: '-1.89px' }],
  display: ['72px', { lineHeight: '1.04', fontWeight: '700', letterSpacing: '-2.016px' }],
  'display-lg': ['96px', { lineHeight: '1.04', fontWeight: '700', letterSpacing: '-4.608px' }],
} as const satisfies Record<string, FontSizeToken>

/** Semantic text colors (`text-text-*`). */
export const TEXT_COLOR = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  tertiary: 'var(--text-tertiary)',
  nav: 'var(--text-nav)',
  'on-accent': 'var(--text-on-accent)',
} as const

/** DESIGN.md rotating accent cast — card / pill / chart fills, never buttons. */
export const ACCENT_PALETTE = {
  marigold: 'var(--marigold)',
  coral: 'var(--coral)',
  saffron: 'var(--saffron)',
  vermillion: 'var(--vermillion)',
  mocha: 'var(--mocha)',
  signal: 'var(--signal-blue)',
  'sky-wash': 'var(--sky-wash)',
  'sky-tint': 'var(--sky-tint)',
  peach: 'var(--peach)',
  midnight: 'var(--midnight)',
} as const

/** DESIGN.md §Border Radius: small 4, buttons 8, cards 12, pills 9999. */
export const RADIUS = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '12px',
  pill: '9999px',
} as const

export type FontSizeName = keyof typeof FONT_SIZE
export type AccentName = keyof typeof ACCENT_PALETTE

export const FONT_SIZE_NAMES = Object.keys(FONT_SIZE) as FontSizeName[]
export const TEXT_COLOR_NAMES = Object.keys(TEXT_COLOR).map((k) => `text-${k}`)
