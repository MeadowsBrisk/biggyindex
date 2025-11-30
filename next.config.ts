import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 4 hours - matches Next.js 16 default, explicit for clarity
    minimumCacheTTL: 14400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i2.littlebiggy.net",
      },

      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "lbindex.vip",
      },
         {
        protocol: "https",
        hostname: "biggyindex.com",
      },
    ],
  },
};

export default nextConfig;
