import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Defaults to bottom-left, where it covers the sidebar footer button.
  devIndicators: { position: "bottom-right" },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "**.fbcdn.net",
      },
    ],
  },
};

export default nextConfig;
