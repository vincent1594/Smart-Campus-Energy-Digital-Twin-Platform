# 前端 —— 多階段:node 編譯 Vite 靜態檔 → nginx 伺服 + 反代 /api
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# build mode 可切換(由 docker-compose 的 WEB_BUILD_MODE 控制,預設 docker):
#   docker → .env.docker:根路徑部署(VITE_API_BASE_URL 空 = 相對路徑,本機 localhost)
#   men    → .env.men   :IIS /MEN/ 子路徑部署(base=/MEN/、API=/MEN,給 ARR 反代)
ARG BUILD_MODE=docker
RUN npm run build -- --mode ${BUILD_MODE}

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
