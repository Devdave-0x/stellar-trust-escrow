/* eslint-disable no-undef */
/** @type {import('next').NextConfig} */

const API_URL = process.env.NEXT_PUBLIC_API_UR || 'http://localhost:5000';
const nextConfig = {
  // TODO (contributor): add image domains if using next/image with external URLs
  images: {
    domains: [],
  },
  // Proxy API calls to backend in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
