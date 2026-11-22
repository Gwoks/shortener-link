import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, errorMessage, isNotFound, qrUrlForCode, qrUrlForId } from './api'

describe('errorMessage', () => {
  it('returns the server message for an ApiError', () => {
    // Arrange
    const error = new ApiError('URL_BLOCKED', 'That destination is blocked.', 422)

    // Act
    const message = errorMessage(error, 'fallback')

    // Assert
    expect(message).toBe('That destination is blocked.')
  })

  it('falls back for non-API failures', () => {
    expect(errorMessage(new TypeError('boom'), 'Try again.')).toBe('Try again.')
    expect(errorMessage(undefined, 'Try again.')).toBe('Try again.')
  })
})

describe('isNotFound', () => {
  it('treats NOT_FOUND and FORBIDDEN identically so ownership never leaks', () => {
    expect(isNotFound(new ApiError('NOT_FOUND', 'x', 404))).toBe(true)
    expect(isNotFound(new ApiError('FORBIDDEN', 'x', 403))).toBe(true)
  })

  it('is false for other errors and non-API values', () => {
    expect(isNotFound(new ApiError('INTERNAL', 'x', 500))).toBe(false)
    expect(isNotFound(new Error('x'))).toBe(false)
  })
})

// ── request() + endpoint wiring (fetch mocked at the network boundary) ──

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('parses JSON bodies and sends same-origin credentials', async () => {
    const fetch = mockFetch(json({ link: { id: 'l1' } }))

    const res = await api.getLink('l1')

    expect(res).toEqual({ link: { id: 'l1' } })
    expect(fetch).toHaveBeenCalledWith(
      '/api/links/l1',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('returns undefined for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }))
    await expect(api.deleteLink('l1')).resolves.toBeUndefined()
  })

  it('maps the error envelope, including Retry-After, to ApiError', async () => {
    mockFetch(
      json(
        { error: { code: 'RATE_LIMITED', message: 'Slow down.', field: 'url' } },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    )

    const error = await api.createLink({ url: 'https://x.test' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfter: 30, field: 'url' })
  })

  it('falls back to INTERNAL for non-JSON error bodies', async () => {
    mockFetch(new Response('oops', { status: 502 }))
    await expect(api.summary('7d')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 })
  })

  it('reports network failures as status 0', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    await expect(api.claimable()).rejects.toMatchObject({ code: 'INTERNAL', status: 0 })
  })
})

describe('api endpoints', () => {
  it.each([
    [
      'listLinks',
      () =>
        api.listLinks({
          q: 'a b',
          status: 'active',
          sort: 'clicks',
          order: 'asc',
          page: 2,
          pageSize: 5,
        }),
      '/api/links?q=a+b&status=active&sort=clicks&order=asc&page=2&pageSize=5',
      'GET',
    ],
    ['listLinks (no params)', () => api.listLinks({}), '/api/links', 'GET'],
    ['patchLink', () => api.patchLink('l1', { status: 'DEACTIVATED' }), '/api/links/l1', 'PATCH'],
    [
      'checkAlias',
      () => api.checkAlias('my alias'),
      '/api/links/check-alias?alias=my%20alias',
      'GET',
    ],
    ['bulk', () => api.bulk(['https://a.test']), '/api/links/bulk', 'POST'],
    [
      'linkAnalytics',
      () => api.linkAnalytics('l1', '30d'),
      '/api/links/l1/analytics?range=30d',
      'GET',
    ],
    ['claim', () => api.claim(['l1']), '/api/guest-links/claim', 'POST'],
    [
      'register',
      () => api.register({ email: 'a@b.test', password: 'pw' }),
      '/api/auth/register',
      'POST',
    ],
  ])('%s calls the right endpoint', async (_name, call, url, method) => {
    const fetch = mockFetch(json({}))
    await call()
    const [calledUrl, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe(url)
    expect(init.method ?? 'GET').toBe(method)
  })

  it('builds QR image URLs', () => {
    expect(qrUrlForCode('a/b', 'md')).toBe('/api/qr/a%2Fb?size=md')
    expect(qrUrlForId('l1', 'lg', true)).toBe('/api/links/l1/qr?size=lg&download=1')
  })
})
