import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    optimizePackageImports: ['leaflet'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.s3.**.amazonaws.com' },
    ],
  },
};

export default nextConfig;
