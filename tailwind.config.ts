/**
 * Tailwind config (root DESIGN.md — "Notion" warm-paper style, light only).
 * Token names come from src/design/tokens.ts (shared with lib/cn.ts); colors
 * resolve to CSS custom properties defined once in globals.css.
 */
import type { Config } from 'tailwindcss'
import { ACCENT_PALETTE, FONT_SIZE, RADIUS, TEXT_COLOR } from './src/design/tokens'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Spacing scale (4px base, DESIGN §2.5) — extends Tailwind defaults.
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          raised: 'var(--bg-surface-raised)',
          subtle: 'var(--bg-subtle)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        ink: 'var(--border-ink)',
        text: TEXT_COLOR,
        ...ACCENT_PALETTE,
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          'subtle-bg': 'var(--accent-subtle-bg)',
          'subtle-hover': 'var(--accent-subtle-hover)',
        },
        success: { fg: 'var(--success-fg)', bg: 'var(--success-bg)' },
        warning: { fg: 'var(--warning-fg)', bg: 'var(--warning-bg)' },
        danger: { fg: 'var(--danger-fg)', bg: 'var(--danger-bg)' },
        info: { fg: 'var(--info-fg)', bg: 'var(--info-bg)' },
        lock: { fg: 'var(--lock-fg)', bg: 'var(--lock-bg)' },
        focus: 'var(--focus-ring)',
        // Chart categorical palette (DESIGN §2.3).
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          6: 'var(--chart-6)',
          grid: 'var(--chart-grid)',
          axis: 'var(--chart-axis)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
      },
      fontSize: FONT_SIZE,
      borderRadius: RADIUS,
      // Shadows are for floating chrome only (nav, popovers, the hero product
      // mockup) — content cards use a hairline border (DESIGN §Elevation).
      boxShadow: {
        nav: 'var(--shadow-nav)',
        mockup: 'var(--shadow-mockup)',
        popover: 'var(--shadow-popover)',
      },
      maxWidth: {
        page: '1440px',
        content: '1200px',
        form: '672px',
        'guest-hero': '720px',
      },
      spacing: {
        header: '64px',
        section: '80px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        emphasized: 'cubic-bezier(.2,0,0,1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '240ms',
      },
      zIndex: {
        sticky: '100',
        nav: '200',
        dropdown: '1000',
        popover: '1100',
        modal: '1200',
        toast: '1300',
        tooltip: '1400',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'content-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'rise-in': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--dur-base) var(--ease-standard)',
        'overlay-in': 'overlay-in var(--dur-base) var(--ease-standard)',
        'content-in': 'content-in var(--dur-base) var(--ease-standard)',
        'sheet-in': 'sheet-in var(--dur-slow) var(--ease-standard)',
        'rise-in': 'rise-in var(--dur-slow) var(--ease-standard)',
        'toast-in': 'toast-in var(--dur-base) var(--ease-standard)',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
