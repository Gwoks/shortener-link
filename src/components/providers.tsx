/**
 * Root provider tree, mounted once so every surface shares one session, one
 * server-state cache, one tooltip delay group, and one toast queue:
 * AuthProvider → QueryClientProvider → TooltipProvider → ToastProvider.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from '@/auth/auth-context'
import { createQueryClient } from '@/data/query-client'
import { ToastProvider } from './ui/toast'
import { TooltipProvider } from './ui/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}
