import { describe, it, expect } from 'vitest'
import {
  randomCode,
  isValidGeneratedCode,
  generateUniqueCode,
  BASE62,
  DEFAULT_CODE_LENGTH,
  GROWN_CODE_LENGTH,
} from '@/lib/shortcode'

describe('shortcode', () => {
  it('randomCode produces Base62 strings of the requested length (AC-1)', () => {
    for (let i = 0; i < 100; i++) {
      const code = randomCode()
      expect(code).toHaveLength(DEFAULT_CODE_LENGTH)
      for (const ch of code) expect(BASE62).toContain(ch)
    }
  })

  it('isValidGeneratedCode validates exactly 6 Base62 chars (AC-1)', () => {
    expect(isValidGeneratedCode('Ab3xK9')).toBe(true)
    expect(isValidGeneratedCode('Ab3xK')).toBe(false) // too short
    expect(isValidGeneratedCode('Ab3xK90')).toBe(false) // too long
    expect(isValidGeneratedCode('Ab3xK-')).toBe(false) // non-Base62
  })

  it('generateUniqueCode retries past collisions and returns a free code (AC-2)', async () => {
    const taken = new Set(['aaaaaa', 'bbbbbb'])
    const queue = ['aaaaaa', 'bbbbbb', 'cccccc'] // first two collide, third is free
    let i = 0
    const code = await generateUniqueCode({
      exists: (c) => taken.has(c),
      rng: () => queue[i++] ?? 'zzzzzz',
    })
    expect(code).toBe('cccccc')
  })

  it('generateUniqueCode grows the length when the base length saturates', async () => {
    // Always-collide at length 6, free at length 7.
    const code = await generateUniqueCode({
      exists: (c) => c.length === DEFAULT_CODE_LENGTH,
      maxAttemptsPerLength: 3,
      rng: (len) => 'x'.repeat(len),
    })
    expect(code).toHaveLength(GROWN_CODE_LENGTH)
  })

  it('generateUniqueCode throws if no free code can be found at all', async () => {
    await expect(
      generateUniqueCode({ exists: () => true, maxAttemptsPerLength: 2 }),
    ).rejects.toThrow(/unique short code/)
  })

  it('checks collisions against the lowercased candidate', async () => {
    const seen: string[] = []
    await generateUniqueCode({
      exists: (c) => {
        seen.push(c)
        return false
      },
      rng: () => 'ABCdef',
    })
    expect(seen[0]).toBe('abcdef')
  })
})
