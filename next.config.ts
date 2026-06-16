import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // 대량 거래내역 업로드(배치 전송)용 여유 한도
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
