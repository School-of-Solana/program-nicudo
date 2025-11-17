import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    }
    return config
  },
  transpilePackages: ['@coral-xyz/anchor', '@solana/web3.js'],
}

export default nextConfig
