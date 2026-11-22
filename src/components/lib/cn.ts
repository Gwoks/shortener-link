import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { FONT_SIZE_NAMES, TEXT_COLOR_NAMES } from '@/design/tokens'

/**
 * Our custom `fontSize` scale (text-body, text-heading, ...) and our nested
 * `text.*` color scale (text-text-primary, ...) share the `text-` prefix. Plain
 * `twMerge` can't tell them apart and silently drops one as a "conflict" (e.g.
 * a button's `text-text-on-accent` vanishing next to `text-body-sm`).
 * Registering both scales — from the same token module tailwind.config.ts
 * uses — keeps the two in sync.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZE_NAMES] }],
      'text-color': [{ text: TEXT_COLOR_NAMES }],
    },
  },
})

/** Merge Tailwind class names, resolving conflicts (last-wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
