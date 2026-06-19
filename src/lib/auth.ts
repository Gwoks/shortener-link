/**
 * Auth.js (NextAuth v5) configuration (ARCHITECTURE.md §4.1). Prisma adapter,
 * JWT session strategy. Providers: Google + GitHub OAuth (only when env client
 * IDs are present, so the app boots offline) + Credentials (email/password,
 * argon2id verify). `session.user.id` is exposed for ownership scoping.
 */
import NextAuth, { type NextAuthConfig } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import { prisma } from './db'
import { verifyPassword } from './hash'
import { env } from './env'

const providers: NextAuthConfig['providers'] = [
  Credentials({
    name: 'Email & Password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
      const password = typeof credentials?.password === 'string' ? credentials.password : ''
      if (!email || !password) return null
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.passwordHash) return null
      const ok = await verifyPassword(user.passwordHash, password)
      if (!ok) return null
      return { id: user.id, email: user.email, name: user.name, image: user.image }
    },
  }),
]

if (env.googleClientId && env.googleClientSecret) {
  providers.push(Google({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }))
}
if (env.githubClientId && env.githubClientSecret) {
  providers.push(GitHub({ clientId: env.githubClientId, clientSecret: env.githubClientSecret }))
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  trustHost: true,
  secret: env.nextAuthSecret,
  pages: {
    signIn: '/signin',
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        ;(session.user as { id?: string }).id = token.id as string
      }
      return session
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
