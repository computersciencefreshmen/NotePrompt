/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker部署支持
  output: 'standalone',

  eslint: {
    // 在构建时忽略 ESLint 错误，允许部署
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 在构建时忽略 TypeScript 错误，允许部署
    ignoreBuildErrors: true,
  },

  // 环境变量配置
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // 服务器外部包配置
  serverExternalPackages: ['mysql2'],
};

export default nextConfig;
