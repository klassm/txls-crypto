import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: process.env.NODE_ENV === "development" ? "" : (basePath || "/__INGRESS_PATH__"),
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