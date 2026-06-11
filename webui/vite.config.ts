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
});
