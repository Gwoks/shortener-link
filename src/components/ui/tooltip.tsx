'use client'

/** Tooltip (DESIGN §4.12). Radix — shows on hover AND focus; never the sole carrier of essential info. */
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../lib/cn'

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          style={{ zIndex: 1400 }}
          className={cn(
            'z-tooltip max-w-xs break-words rounded-sm bg-surface-raised px-2.5 py-1.5 text-caption text-text-primary shadow-md',
            'border border-border data-[state=delayed-open]:animate-fade-in',
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--bg-surface-raised)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
