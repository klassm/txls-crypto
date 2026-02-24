import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
  serverExternalPackages: ["@/migrations/*"],
};

export default nextConfig;