'use client'

/**
 * Client provider tree (ARCHITECTURE.md §4.1, DESIGN §2.2/§4.9). Composes, in
 * order: next-auth SessionProvider (client `useSession`/`signOut`), the
 * token-driven ThemeProvider (FR-41/AC-46), the Radix Tooltip provider, and the
 * Toast provider/viewport (FR-42/AC-47). Mounted once at the root so every
 * surface shares a single session, theme, and toast queue.
 */
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from './theme/theme'
import { ToastProvider } from './ui/toast'
import { TooltipProvider } from './ui/tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
