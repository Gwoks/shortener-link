import { describe, it, expect } from 'vitest'
import { generateQrPng, isQrSize, QR_SIZES } from '@/lib/qr'

describe('QR generation (FR-12/13, AC-17/18)', () => {
  it('isQrSize guards the preset names', () => {
    expect(isQrSize('sm')).toBe(true)
    expect(isQrSize('md')).toBe(true)
    expect(isQrSize('lg')).toBe(true)
    expect(isQrSize('xl')).toBe(false)
    expect(isQrSize(null)).toBe(false)
  })

  it('offers at least two distinct size presets (FR-13)', () => {
    const sizes = new Set(Object.values(QR_SIZES))
    expect(sizes.size).toBeGreaterThanOrEqual(2)
  })

  it('produces a valid PNG buffer', async () => {
    const png = await generateQrPng('http://localhost:3000/ab3xk9', 'sm')
    expect(Buffer.isBuffer(png)).toBe(true)
    // PNG magic number.
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.length).toBeGreaterThan(100)
  })

  it('larger presets generally produce larger images', async () => {
    const sm = await generateQrPng('http://localhost:3000/x', 'sm')
    const lg = await generateQrPng('http://localhost:3000/x', 'lg')
    expect(lg.length).toBeGreaterThan(sm.length)
  })
})
