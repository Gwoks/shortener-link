'use client'

/**
 * Dropdown menu (DESIGN §4.7/4.12, NFR-14, AC-48). Radix DropdownMenu provides
 * roving tabindex, arrow-key navigation, type-ahead, and Escape — the row action
 * menu and account menu use this.
 */
import * as Menu from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        style={{ zIndex: 1000 }}
        className={cn(
          'z-dropdown min-w-[11rem] overflow-hidden rounded-md border border-border bg-surface-raised p-1 shadow-md',
          'data-[state=open]:animate-content-in',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
})

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-body-sm text-text-secondary outline-none',
        'data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        destructive &&
          'text-danger-fg data-[highlighted]:bg-danger-bg data-[highlighted]:text-danger-fg',
        className,
      )}
      {...props}
    />
  )
})

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <Menu.Label className="px-2.5 py-1.5 text-overline uppercase text-text-tertiary">{children}</Menu.Label>
}
