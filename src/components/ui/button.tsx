/**
 * Button (DESIGN.md §Components). Variants map 1:1 to the spec:
 *   primary   → Primary CTA (the single filled blue action per screen)
 *   secondary → Ghost CTA (sky-tint wash, blue label)
 *   ghost     → Ghost Text (no fill, ink label)
 *   outline   → Outlined Text (1px ink border, 4px radius, compact)
 * plus danger (destructive confirm) and link. Loading state sets aria-busy,
 * swapping a leading spinner for the icon while keeping the label. Icon buttons
 * always require an aria-label (enforced by usage, not types).
 */
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-base ease-standard disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-text-on-accent hover:bg-accent-hover',
        secondary: 'bg-accent-subtle-bg text-accent hover:bg-accent-subtle-hover',
        ghost: 'text-text-primary hover:bg-surface-hover',
        outline: 'rounded-xs border border-ink text-text-primary hover:bg-surface-hover',
        danger: 'bg-danger-fg text-white hover:opacity-90',
        link: 'h-auto p-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-body-sm',
        md: 'h-8 px-[15px] text-body-sm',
        lg: 'h-11 px-5 text-body',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, asChild, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      {...props}
    >
      {/* When asChild, Radix Slot requires a SINGLE element child — never inject
          a sibling (a `loading && <Spinner/>` evaluates to `false`, which would
          give Slot two children and throw). The leading spinner only applies to
          the real <button>. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="h-4 w-4" decorative />}
          {children}
        </>
      )}
    </Comp>
  )
})

export { buttonVariants }
