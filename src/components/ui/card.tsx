/**
 * Card (DESIGN.md §White / Accent / Dark Feature Card). The one surface
 * primitive: 12px radius, 24px padding, and either a hairline border on white
 * (never a shadow) or a flat accent / midnight fill with contrast-safe text.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export const cardVariants = cva('rounded-md', {
  variants: {
    tone: {
      white: 'border border-border bg-surface text-text-primary',
      marigold: 'bg-marigold text-black',
      coral: 'bg-coral text-black',
      sky: 'bg-sky-wash text-black',
      tint: 'bg-sky-tint text-text-primary',
      peach: 'bg-peach text-black',
      dark: 'bg-midnight text-white',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-6',
    },
  },
  defaultVariants: { tone: 'white', padding: 'md' },
})

export type CardTone = NonNullable<VariantProps<typeof cardVariants>['tone']>

type CardElement = 'div' | 'section' | 'article' | 'li'

export interface CardProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {
  as?: CardElement
}

export function Card({ as: Element = 'div', tone, padding, className, ...props }: CardProps) {
  return <Element className={cn(cardVariants({ tone, padding }), className)} {...props} />
}
