import { describe, expect, it } from 'vitest'
import { cn } from '@/components/lib/cn'
import { FONT_SIZE, FONT_SIZE_NAMES, RADIUS, TEXT_COLOR_NAMES } from './tokens'

describe('design tokens', () => {
  it('matches the DESIGN.md display type scale', () => {
    expect(FONT_SIZE['display-lg']).toEqual([
      '96px',
      expect.objectContaining({ letterSpacing: '-4.608px' }),
    ])
    expect(FONT_SIZE.display).toEqual([
      '72px',
      expect.objectContaining({ letterSpacing: '-2.016px' }),
    ])
    expect(FONT_SIZE['display-sm']).toEqual([
      '54px',
      expect.objectContaining({ letterSpacing: '-1.89px' }),
    ])
  })

  it('caps rectangular radii at the 12px card radius', () => {
    expect(RADIUS.md).toBe('12px')
    expect(RADIUS.lg).toBe('12px')
    expect(RADIUS.sm).toBe('8px')
  })
})

describe('cn (token-aware tailwind-merge)', () => {
  it('keeps a custom text size and a custom text color together', () => {
    expect(cn('text-body-sm', 'text-text-on-accent')).toBe('text-body-sm text-text-on-accent')
  })

  it('resolves conflicts within the custom font-size scale', () => {
    expect(cn('text-heading', 'text-display')).toBe('text-display')
  })

  it('resolves conflicts within the custom text-color scale', () => {
    expect(cn('text-text-primary', 'text-text-secondary')).toBe('text-text-secondary')
  })

  it('registers every token name', () => {
    for (const size of FONT_SIZE_NAMES) {
      expect(cn('text-body', `text-${size}`)).toBe(`text-${size}`)
    }
    for (const color of TEXT_COLOR_NAMES) {
      expect(cn('text-text-primary', `text-${color}`)).toBe(`text-${color}`)
    }
  })
})
