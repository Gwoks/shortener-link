'use client'

/**
 * Button (DESIGN §4.1). Variants: primary/secondary/ghost/danger/link.
 * Sizes: sm(28)/md(36)/lg(44). Loading state preserves width and sets aria-busy,
 * swapping a leading spinner for the icon while keeping the label. Icon buttons
 * always require an aria-label (enforced by usage, not types).
 */
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-tertiary disabled:shadow-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-text-on-accent hover:bg-accent-hover',
        secondary:
          'border border-border-strong bg-surface text-text-primary hover:bg-surface-hover',
        ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        danger: 'bg-danger-fg text-white hover:opacity-90',
        link: 'h-auto p-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-3 text-body-sm',
        md: 'h-9 px-4 text-body-sm',
        lg: 'h-11 px-5 text-body',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
          {loading && <Spinner className="h-4 w-4" />}
          {children}
        </>
      )}
    </Comp>
  )
})

export { buttonVariants }
