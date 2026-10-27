import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
export default function nextConfig(phase: string): NextConfig {
  return {
    output: "export",
    ...(phase === PHASE_DEVELOPMENT_SERVER ? { distDir: ".next-dev" } : {}),
    images: { unoptimized: true },
  };
}
