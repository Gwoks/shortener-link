/**
 * Auth.js (NextAuth v5) catch-all handler — sign-in/out, OAuth callbacks,
 * credentials, session/CSRF. ARCHITECTURE.md §4.1, §6.2.
 */
import { handlers } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const { GET, POST } = handlers
