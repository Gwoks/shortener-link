/**
 * Dialog / modal (DESIGN §4.8, NFR-14, AC-48). Radix Dialog gives focus trap,
 * Escape to close, scroll lock, and focus restore to the trigger for free. On
 * mobile (<640px) large dialogs render as bottom sheets (slide up). Scrim uses
 * --overlay-scrim.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/** Shared midnight scrim for modals and sheets. */
export function DialogOverlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-[var(--overlay-scrim)] data-[state=open]:animate-overlay-in" />
  )
}

function CloseButton({ label = 'Close' }: { label?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className="absolute right-4 top-4 rounded-sm p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </DialogPrimitive.Close>
  )
}

/**
 * Side sheet (mobile navigation). Same focus trap / Escape / scroll lock as
 * DialogContent, sliding in from the right edge.
 */
export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel?: string }
>(function SheetContent({ className, children, closeLabel, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed inset-y-0 right-0 z-modal flex w-[min(20rem,88vw)] flex-col border-l border-border bg-canvas outline-none data-[state=open]:animate-sheet-in',
          className,
        )}
        {...props}
      >
        {children}
        <CloseButton label={closeLabel} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Render as a full-screen-ish bottom sheet on mobile. */
    size?: 'sm' | 'md' | 'lg'
    hideClose?: boolean
  }
>(function DialogContent({ className, children, size = 'md', hideClose, ...props }, ref) {
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-modal flex max-h-[92vh] flex-col overflow-hidden border border-border bg-surface shadow-popover outline-none',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 rounded-t-lg data-[state=open]:animate-rise-in',
          // Desktop: centered modal
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md sm:data-[state=open]:animate-content-in',
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && <CloseButton />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogHeader({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('shrink-0 border-b border-border px-6 py-4', className)}>{children}</div>
  )
}

export function DialogTitle({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Title className={cn('text-subheading text-text-primary', className)}>
      {children}
    </DialogPrimitive.Title>
  )
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Description className={cn('mt-1 text-body-sm text-text-secondary', className)}>
      {children}
    </DialogPrimitive.Description>
  )
}

export function DialogBody({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)}>{children}</div>
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
    >
      {children}
    </div>
  )
}
