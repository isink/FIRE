/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy 行情 API 到本地 Flask 后端（保持现有 data-check/backend.py 不动）
      {
        source: '/api/proxy/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
