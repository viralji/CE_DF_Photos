import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  compress: true,
  // Use this project as the workspace root (avoids "multiple lockfiles" warning)
  outputFileTracingRoot: path.join(__dirname),
  // Reduce dev console noise: no per-request GET/POST logs
  logging: {
    incomingRequests: false,
  },
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
