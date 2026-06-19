/**
 * Root layout (DESIGN.md §2.2/§6, FR-41, AC-46). Loads the token-driven global
 * styles, sets `<html lang>`, and injects the synchronous theme-init script
 * before hydration to prevent a flash of the wrong theme. The client provider
 * tree (session + theme + tooltip + toast) wraps all routes.
 */
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { THEME_INIT_SCRIPT } from '@/components/theme/theme'

export const metadata: Metadata = {
  title: 'Tess — Link Shortener',
  description: 'Fast, self-hostable URL shortener with analytics, QR codes, and link management.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored/system theme before paint (AC-46). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
