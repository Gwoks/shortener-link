/**
 * Shared Zod schemas for link create/edit/bulk/unlock/auth (ARCHITECTURE.md §6).
 * Backend-authored, frontend-consumed — the executable contract (FR-44, etc.).
 */
import { z } from 'zod'
import { httpUrlSchema } from './url'
import { ALIAS_MAX, ALIAS_MIN, ALIAS_PATTERN } from '../alias'

export const utmSchema = z
  .object({
    source: z.string().trim().max(200).optional(),
    medium: z.string().trim().max(200).optional(),
    campaign: z.string().trim().max(200).optional(),
    term: z.string().trim().max(200).optional(),
    content: z.string().trim().max(200).optional(),
  })
  .partial()
  .optional()

export const aliasSchema = z
  .string()
  .trim()
  .min(ALIAS_MIN, `Custom links must be at least ${ALIAS_MIN} characters.`)
  .max(ALIAS_MAX, `Custom links must be at most ${ALIAS_MAX} characters.`)
  .regex(ALIAS_PATTERN, 'Use only letters, numbers, hyphens, and underscores.')

// Coerce ISO date-time strings to Date; reject non-dates.
const futureDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .transform((s) => new Date(s))

export const createLinkSchema = z.object({
  url: httpUrlSchema,
  alias: aliasSchema.optional(),
  expiresAt: futureDateSchema.optional(),
  maxClicks: z.number().int().positive().max(1_000_000_000).optional(),
  password: z.string().min(1).max(200).optional(),
  utm: utmSchema,
})
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const patchLinkSchema = z
  .object({
    destinationUrl: httpUrlSchema.optional(),
    alias: aliasSchema.optional(),
    expiresAt: futureDateSchema.nullable().optional(),
    maxClicks: z.number().int().positive().max(1_000_000_000).nullable().optional(),
    status: z.enum(['ACTIVE', 'DEACTIVATED']).optional(),
    // password: string sets a new password; null clears it; undefined leaves it.
    password: z.string().min(1).max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes provided.' })
export type PatchLinkInput = z.infer<typeof patchLinkSchema>

export const bulkSchema = z.object({
  urls: z.array(z.string().trim()).min(1, 'Provide at least one URL.'),
})
export type BulkInput = z.infer<typeof bulkSchema>

export const unlockSchema = z.object({
  password: z.string().min(1, 'Enter the password.').max(200),
})

export const registerSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(320),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  name: z.string().trim().max(200).optional(),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const claimSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
})

export const analyticsRangeSchema = z.enum(['7d', '30d', '90d', 'all']).default('30d')
export const listStatusFilterSchema = z.enum(['active', 'expiring', 'expired', 'protected']).optional()
export const listSortSchema = z.enum(['created', 'clicks']).default('created')
export const listOrderSchema = z.enum(['asc', 'desc']).default('desc')
