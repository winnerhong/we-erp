import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // 대량 거래내역 업로드(배치 전송) + 자료실 파일 업로드용 여유 한도
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
