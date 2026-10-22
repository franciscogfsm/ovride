import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 15.5's segment explorer crashes the dev overlay with a missing client manifest.
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
