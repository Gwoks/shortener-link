'use client'

/**
 * Chart theming + motion bridge (DESIGN §2.3, NFR-13, AC-50). Recharts needs real
 * color strings (not Tailwind classes), so we read the categorical palette and
 * axis/grid tokens from the resolved CSS custom properties and re-read them when
 * the theme flips (light/dark via the `.dark` class on <html>). Also exposes
 * whether motion should be disabled so charts honor prefers-reduced-motion.
 */
import { useEffect, useState } from 'react'
import { useTheme } from '../theme/theme'

export interface ChartTheme {
  /** Color-blind-aware categorical series colors (--chart-1..6). */
  series: string[]
  grid: string
  axis: string
  /** Surface used for tooltip/legend backgrounds. */
  surface: string
  border: string
  text: string
  /** True when prefers-reduced-motion is set — disable chart animation. */
  reducedMotion: boolean
}

const SERIES_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const

/** Fallback colors so SSR/first paint never renders invisible strokes. */
const FALLBACK: ChartTheme = {
  series: ['#5b63f0', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'],
  grid: '#e5e7eb',
  axis: '#6b7280',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  reducedMotion: false,
}

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim()
  return v || fallback
}

function readTheme(reducedMotion: boolean): ChartTheme {
  if (typeof window === 'undefined') return { ...FALLBACK, reducedMotion }
  const styles = getComputedStyle(document.documentElement)
  return {
    series: SERIES_VARS.map((v, i) => readVar(styles, v, FALLBACK.series[i])),
    grid: readVar(styles, '--chart-grid', FALLBACK.grid),
    axis: readVar(styles, '--chart-axis', FALLBACK.axis),
    surface: readVar(styles, '--bg-surface-raised', FALLBACK.surface),
    border: readVar(styles, '--border-default', FALLBACK.border),
    text: readVar(styles, '--text-primary', FALLBACK.text),
    reducedMotion,
  }
}

/**
 * Resolve the chart palette for the active theme. Returns stable fallbacks during
 * SSR, then the real tokens after mount; recomputes whenever the resolved theme
 * changes so dark/light stay token-driven.
 */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme()
  const [reducedMotion, setReducedMotion] = useState(false)
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK)

  // Track prefers-reduced-motion (AC-50 / NFR motion).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Re-read CSS tokens after mount and on every theme/motion change.
  useEffect(() => {
    setTheme(readTheme(reducedMotion))
  }, [resolved, reducedMotion])

  return theme
}
