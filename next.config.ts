import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "tiktok-live-connector"],
  devIndicators: false,
};

export default nextConfig;
