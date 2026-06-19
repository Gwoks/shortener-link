/**
 * Route-handler helpers (ARCHITECTURE.md §4.7). `handle` wraps a handler so any
 * thrown ApiError or ZodError becomes the standard error envelope and unexpected
 * errors become a 500 INTERNAL (no stack/ID leakage). `parseJson` validates a
 * request body with Zod and throws VALIDATION_ERROR on failure.
 */
import { NextResponse } from 'next/server'
import { ZodError, type ZodTypeAny, type z } from 'zod'
import { ApiError, apiError } from './errors'

export async function handle<T>(fn: () => Promise<NextResponse<T>>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse()
    if (err instanceof ZodError) {
      const first = err.errors[0]
      return apiError('VALIDATION_ERROR', {
        message: first?.message ?? 'Some details need fixing.',
        field: first?.path?.join('.') || undefined,
      })
    }
    console.error('[api] unhandled error:', err)
    return apiError('INTERNAL')
  }
}

export async function parseJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError('VALIDATION_ERROR', { message: 'Request body must be valid JSON.' })
  }
  return schema.parse(body) as z.infer<S>
}

export function parseQuery<S extends ZodTypeAny>(searchParams: URLSearchParams, schema: S): z.infer<S> {
  const obj: Record<string, string> = {}
  for (const [k, v] of searchParams.entries()) obj[k] = v
  return schema.parse(obj) as z.infer<S>
}
