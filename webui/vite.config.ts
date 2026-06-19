import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開發時把 /api 代理到後端 (port 8126),避免 CORS、前端只需打相對路徑
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8126",
        changeOrigin: true,
      },
    },
  },
  build: {
    // 把大型 vendor 拆成獨立 chunk(可長期快取、與業務碼分離、平行下載)
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          echarts: ["echarts", "echarts-for-react"],
          antd: ["antd", "@ant-design/icons"],
        },
      },
    },
    chunkSizeWarningLimit: 1300,   // echarts/antd 為大型 vendor,已獨立拆分
  },
});
