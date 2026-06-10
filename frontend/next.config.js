/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/reconciliation',
        destination: '/shift-reconciliation',
        permanent: true,
      },
    ]
  },
}
module.exports = nextConfig
