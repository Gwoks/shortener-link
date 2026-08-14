'use client'

/**
 * Client provider tree (ARCHITECTURE.md §4.1). Composes, in order: the SPA
 * AuthProvider (client session via GET /api/session), the Radix Tooltip
 * provider, and the Toast provider/viewport (FR-42/AC-47). Mounted once at the
 * root so every surface shares a single session and toast queue.
 */
import { AuthProvider } from '@/auth/auth-context'
import { ToastProvider } from './ui/toast'
import { TooltipProvider } from './ui/tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </AuthProvider>
  )
}
