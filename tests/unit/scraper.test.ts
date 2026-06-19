import { describe, it, expect } from 'vitest'
import { extractMeta } from '@/worker/scraper'

describe('metadata extraction (FR-19, AC-26)', () => {
  it('extracts title and meta description', () => {
    const html = `
      <html><head>
        <title>  Example Page  </title>
        <meta name="description" content="A great page.">
      </head><body>hi</body></html>`
    expect(extractMeta(html)).toEqual({ title: 'Example Page', description: 'A great page.' })
  })

  it('falls back to og:description when no standard description', () => {
    const html = `<html><head><title>T</title><meta property="og:description" content="OG desc"></head></html>`
    expect(extractMeta(html)).toEqual({ title: 'T', description: 'OG desc' })
  })

  it('prefers the standard description over og:description', () => {
    const html = `<html><head>
      <meta property="og:description" content="OG">
      <meta name="description" content="STD">
    </head></html>`
    expect(extractMeta(html).description).toBe('STD')
  })

  it('returns nulls when nothing is present (scrape-failed fallback territory)', () => {
    expect(extractMeta('<html><body>no head meta</body></html>')).toEqual({
      title: null,
      description: null,
    })
  })

  it('truncates very long values', () => {
    const longTitle = 'x'.repeat(500)
    const longDesc = 'y'.repeat(800)
    const html = `<html><head><title>${longTitle}</title><meta name="description" content="${longDesc}"></head></html>`
    const meta = extractMeta(html)
    expect(meta.title!.length).toBe(300)
    expect(meta.description!.length).toBe(600)
  })
})
