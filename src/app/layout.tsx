/**
 * Root layout. Backend-authored minimal scaffold so the app builds and the
 * redirect-side pages render; the FRONTEND agent owns the real layout, theme
 * tokens, providers, and global styles (DESIGN.md, FR-41). Kept intentionally
 * lean here.
 */
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Link Shortener',
  description: 'Fast, self-hostable URL shortener with analytics, QR codes, and link management.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
