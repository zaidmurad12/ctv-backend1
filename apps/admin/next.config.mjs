/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: 'dist',
  eslint: {
    ignoreDuringBuilds: true,
  },
  // A self-contained server bundle (node_modules pruned to only what's actually needed) - what
  // the admin's own Dockerfile copies into its runtime stage, so deploying it doesn't need a full
  // `pnpm install` inside the final image.
  output: 'standalone',
};

export default nextConfig;
