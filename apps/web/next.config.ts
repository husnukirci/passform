import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source, so Next compiles them.
  transpilePackages: ["@passform/contracts", "@passform/domain"],
};

export default nextConfig;
