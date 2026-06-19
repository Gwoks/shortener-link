import { describe, it, expect } from 'vitest'
import { validateAliasSyntax, normalizeAlias, suggestAliases, ALIAS_MIN, ALIAS_MAX } from '@/lib/alias'

describe('alias validation (FR-2/3/44)', () => {
  it('accepts a valid alias', () => {
    expect(validateAliasSyntax('my-custom-name')).toEqual({ ok: true })
    expect(validateAliasSyntax('spring_sale2').ok).toBe(true)
  })

  it('rejects too-short and too-long aliases (invalid)', () => {
    expect(validateAliasSyntax('ab').reason).toBe('invalid')
    expect(validateAliasSyntax('a'.repeat(ALIAS_MAX + 1)).reason).toBe('invalid')
  })

  it('accepts boundary lengths', () => {
    expect(validateAliasSyntax('a'.repeat(ALIAS_MIN)).ok).toBe(true)
    expect(validateAliasSyntax('a'.repeat(ALIAS_MAX)).ok).toBe(true)
  })

  it('rejects out-of-charset aliases (invalid)', () => {
    expect(validateAliasSyntax('has space').reason).toBe('invalid')
    expect(validateAliasSyntax('emoji😀x').reason).toBe('invalid')
    expect(validateAliasSyntax('slash/here').reason).toBe('invalid')
    expect(validateAliasSyntax('dot.here').reason).toBe('invalid')
  })

  it('rejects reserved words case-insensitively (AC-5)', () => {
    for (const word of ['admin', 'API', 'Login', 'dashboard', 'settings', 'healthz']) {
      const v = validateAliasSyntax(word)
      expect(v.ok).toBe(false)
      expect(v.reason).toBe('reserved')
    }
  })

  it('normalizeAlias lowercases and trims', () => {
    expect(normalizeAlias('  MyAlias ')).toBe('myalias')
  })

  it('suggestAliases returns up to 3 valid, non-reserved alternatives (AC-4)', () => {
    const out = suggestAliases('spring-sale', () => 'x')
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThanOrEqual(3)
    for (const s of out) {
      const v = validateAliasSyntax(s)
      expect(v.ok).toBe(true)
    }
  })

  it('suggestAliases never suggests a reserved word', () => {
    const out = suggestAliases('admin', () => 'x')
    for (const s of out) expect(validateAliasSyntax(s).reason).not.toBe('reserved')
  })
})
