/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // argon2 and maxmind are native/node-only; keep them external to the server
    // bundle so they are required at runtime rather than bundled by webpack.
    serverComponentsExternalPackages: ['argon2', 'maxmind', '@prisma/client'],
  },
}

export default nextConfig
