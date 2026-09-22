import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source, so Next compiles them.
  transpilePackages: ["@passform/contracts"],
};

export default nextConfig;
