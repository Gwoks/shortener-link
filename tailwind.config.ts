/**
 * Tailwind config (DESIGN.md §2, ARCHITECTURE.md §1.2). All colors map to SEMANTIC
 * CSS custom properties defined in globals.css, so dark/light switch via tokens
 * (FR-41/NFR-13) — never hardcoded inversion. Components reference `bg-surface`,
 * `text-secondary`, `border-default`, `accent`, etc. — not raw palette values.
 */
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
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
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          'on-accent': 'var(--text-on-accent)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          'subtle-bg': 'var(--accent-subtle-bg)',
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
        mono: 'var(--font-mono)',
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.1', fontWeight: '700' }],
        h1: ['30px', { lineHeight: '1.2', fontWeight: '700' }],
        h2: ['24px', { lineHeight: '1.25', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h4: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.5' }],
        'body-sm': ['13px', { lineHeight: '1.45' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        overline: ['11px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.04em' }],
        mono: ['13px', { lineHeight: '1.5' }],
        'mono-lg': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        pill: '9999px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      maxWidth: {
        content: '1200px',
        'guest-hero': '640px',
        settings: '640px',
      },
      spacing: {
        'sidebar': '248px',
        'sidebar-collapsed': '64px',
        'header': '56px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        emphasized: 'cubic-bezier(.2,0,0,1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
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
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
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
        'toast-in': 'toast-in var(--dur-base) var(--ease-standard)',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
