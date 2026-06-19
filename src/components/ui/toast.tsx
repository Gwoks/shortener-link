'use client'

/**
 * Toast system (DESIGN §4.9, FR-42, AC-47). Built on Radix Toast so messages are
 * announced via an aria-live region; success is polite, errors assertive. The
 * toast is never the SOLE confirmation — copy buttons also flip to a copied
 * state. Top-right on desktop, top-center on mobile.
 */
import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState } from 'react'
import { cn } from '../lib/cn'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: ToastVariant }) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-success-fg',
  error: 'text-danger-fg',
  info: 'text-info-fg',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(({ title, description, variant = 'info' }) => {
    const id = ++counter
    setItems((prev) => [...prev, { id, title, description, variant }])
  }, [])

  const success = useCallback<ToastContextValue['success']>(
    (title, description) => toast({ title, description, variant: 'success' }),
    [toast],
  )
  const error = useCallback<ToastContextValue['error']>(
    (title, description) => toast({ title, description, variant: 'error' }),
    [toast],
  )

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map((t) => {
          const Icon = ICONS[t.variant]
          return (
            <ToastPrimitive.Root
              key={t.id}
              type={t.variant === 'error' ? 'foreground' : 'background'}
              duration={t.variant === 'error' ? 7000 : 4000}
              onOpenChange={(open) => {
                if (!open) remove(t.id)
              }}
              className={cn(
                'group pointer-events-auto relative flex w-[20rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-md border border-border bg-surface-raised p-3 shadow-md',
                'data-[state=open]:animate-toast-in data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLOR[t.variant])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-body-sm font-semibold text-text-primary">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-body-sm text-text-secondary">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className="shrink-0 rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport className="fixed top-4 right-4 z-toast flex max-w-full flex-col gap-2 outline-none max-[640px]:left-4 max-[640px]:right-4 max-[640px]:items-center" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
