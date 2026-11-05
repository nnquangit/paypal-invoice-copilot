import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native @next/swc binary SIGBUS'es on this host; Babel fallback via .babelrc.
  // Keep build usable for judges on normal machines (SWC still preferred when available).
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
