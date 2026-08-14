import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Both our custom `fontSize` scale (text-body, text-h2, ...) and our custom
 * nested `text.*` color scale (text-text-primary, text-text-on-accent, ...)
 * share the `text-` prefix. Plain `twMerge` doesn't know about either scale,
 * so it can't tell them apart and silently drops one as a "conflict" — e.g. a
 * button's `text-text-on-accent` color vanishing next to its `text-body-sm`
 * size class. Registering both scales fixes that.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'h1', 'h2', 'h3', 'h4', 'body', 'body-sm', 'caption', 'overline', 'mono', 'mono-lg'] },
      ],
      'text-color': [{ text: ['text-primary', 'text-secondary', 'text-tertiary', 'text-on-accent'] }],
    },
  },
})

/** Merge Tailwind class names, resolving conflicts (last-wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
