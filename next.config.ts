import type { NextConfig } from "next";

// Derived from the env var (already required for the app to function) rather than
// hardcoded, so a future Supabase project/org change doesn't leave this silently wrong.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            // Supabase Storage public bucket host — post-composer image attachments (PIC-11).
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
