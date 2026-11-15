/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dependency-canary/shared'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        fs: false,
        path: false,
        util: false,
        os: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
