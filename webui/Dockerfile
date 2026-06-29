# 前端 —— 多階段:node 編譯 Vite 靜態檔 → nginx 伺服 + 反代 /api
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# --mode docker → 載入 .env.docker(VITE_API_BASE_URL 空 = 相對路徑)
RUN npm run build -- --mode docker

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
