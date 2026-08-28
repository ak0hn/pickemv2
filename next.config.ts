import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // Supabase Storage public bucket host — post-composer image attachments (PIC-11).
        hostname: "qjjoaxmcsjmmsqbauwzx.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
