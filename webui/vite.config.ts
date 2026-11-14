import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 開發時把 /api 代理到後端 (port 8126),避免 CORS、前端只需打相對路徑
export default defineConfig(({ mode }) => {
  // base 由各部署的 env 控制,避免白畫面:
  //   Render(.env.production)/ Docker(.env.docker)= 服務在網域根 → 不設 → "/"
  //   MEN/IIS 子路徑(.env.men,--mode men)= VITE_BASE_PATH=/MEN/ → 資源加 /MEN/ 前綴
  const env = loadEnv(mode, process.cwd(), "");
  return {
  base: env.VITE_BASE_PATH || "/",
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
  };
});
