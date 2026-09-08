import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.GITHUB_PAGES === "true" ? "/open-higgsfield" : "",
  images: { unoptimized: true },
};

export default nextConfig;
