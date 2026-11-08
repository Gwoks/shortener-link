import { describe, expect, it } from 'vitest'
import { ApiError } from '@/components/lib/api'
import { createQueryClient, shouldRetry } from './query-client'

describe('shouldRetry', () => {
  it('retries network failures and 5xx responses', () => {
    expect(shouldRetry(0, new ApiError('INTERNAL', 'Network error', 0))).toBe(true)
    expect(shouldRetry(1, new ApiError('INTERNAL', 'Server error', 503))).toBe(true)
    expect(shouldRetry(0, new TypeError('fetch failed'))).toBe(true)
  })

  it('never retries client errors', () => {
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 'Missing', 404))).toBe(false)
    expect(shouldRetry(0, new ApiError('RATE_LIMITED', 'Slow down', 429))).toBe(false)
  })

  it('stops after the retry budget is spent', () => {
    expect(shouldRetry(2, new ApiError('INTERNAL', 'Server error', 500))).toBe(false)
  })
})

describe('createQueryClient', () => {
  it('disables window-focus refetch and mutation retries', () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaults.mutations?.retry).toBe(false)
  })
})
