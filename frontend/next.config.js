/* eslint-disable no-undef */
/** @type {import('next').NextConfig} */
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
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
