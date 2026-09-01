/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: 'dist',
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
