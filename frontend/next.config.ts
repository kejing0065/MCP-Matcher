import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set the root for file tracing and watching to the project directory to prevent scanning C:\Users\User
  outputFileTracingRoot: process.cwd(),
  // Disable type checks during build to significantly save RAM and CPU
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable separate parallel build workers to keep memory allocation low
  experimental: {
    webpackBuildWorker: false,
  },
  // Force Webpack to compile sequentially to avoid simultaneous memory allocations
  webpack: (config, { dev }) => {
    if (dev) {
      config.parallelism = 1; // Process 1 module at a time to prevent RAM spikes
      config.cache = false;   // Disable Webpack caching in development to keep RAM extremely low
    }
    return config;
  },
};

export default nextConfig;
