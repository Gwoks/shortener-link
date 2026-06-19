import { describe, it, expect } from 'vitest'
import { apiError, ApiError, ERROR_STATUS, ERROR_DEFAULT_MESSAGE } from '@/lib/errors'

describe('error envelope (§6.3, FR-37)', () => {
  it('maps every canonical code to its documented HTTP status', () => {
    expect(ERROR_STATUS.VALIDATION_ERROR).toBe(422)
    expect(ERROR_STATUS.ALIAS_TAKEN).toBe(409)
    expect(ERROR_STATUS.ALIAS_RESERVED).toBe(422)
    expect(ERROR_STATUS.URL_BLOCKED).toBe(400)
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429)
    expect(ERROR_STATUS.UNLOCK_LOCKED).toBe(429)
    expect(ERROR_STATUS.WRONG_PASSWORD).toBe(401)
    expect(ERROR_STATUS.UNAUTHENTICATED).toBe(401)
    expect(ERROR_STATUS.FORBIDDEN).toBe(403)
    expect(ERROR_STATUS.NOT_FOUND).toBe(404)
    expect(ERROR_STATUS.BULK_LIMIT_EXCEEDED).toBe(413)
    expect(ERROR_STATUS.EMAIL_TAKEN).toBe(409)
    expect(ERROR_STATUS.INTERNAL).toBe(500)
  })

  it('builds a response with the standard envelope and status', async () => {
    const res = apiError('ALIAS_TAKEN', { field: 'alias', suggestions: ['a-2', 'a-go'] })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('ALIAS_TAKEN')
    expect(body.error.field).toBe('alias')
    expect(body.error.suggestions).toEqual(['a-2', 'a-go'])
    expect(body.error.message).toBe(ERROR_DEFAULT_MESSAGE.ALIAS_TAKEN)
  })

  it('every default message is human, non-empty, and recovery-oriented', () => {
    for (const [code, msg] of Object.entries(ERROR_DEFAULT_MESSAGE)) {
      expect(msg.length, code).toBeGreaterThan(10)
    }
  })

  it('ApiError.toResponse round-trips a custom message', async () => {
    const res = new ApiError('URL_BLOCKED', { message: 'custom' }).toResponse()
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('custom')
  })
})
