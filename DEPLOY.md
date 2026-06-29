# Server 部署指南（Docker Compose）

校園配電數位孿生平台，一鍵在任何裝有 Docker 的 server 上跑起來。
**不需要** Render、不需要外部資料庫、不需要手動裝 Python/Node — 全部包在容器裡。

## 架構

```
[瀏覽器] → web (nginx) ──/api/*──反代──> api (FastAPI:8126) ──> db (PostgreSQL)
                └─ 伺服前端靜態檔 + SPA 路由
```

| 容器 | 內容 | 對外 |
|------|------|------|
| `web` | nginx：前端靜態檔 + 反代 `/api` | port **8080**（可改） |
| `api` | FastAPI + pandapower + XGBoost（內含模型與量測資料） | 僅內部 |
| `db`  | PostgreSQL（訪客統計／設定／回饋持久化） | 僅內部，資料存於 volume |

## 前置需求

- 一台 Linux server（2 核 / 4GB RAM 以上建議）
- 已安裝 **Docker** 與 **Docker Compose v2**
  ```bash
  docker --version          # 確認有裝
  docker compose version
  ```

## 部署步驟

```bash
# 1) 取得整個專案（不能只拿 docker-compose.yml — 它要 build 原始碼）
git clone <本 repo 的 GitHub 網址>
cd 論文實驗X電錶          # 或 clone 下來的資料夾名

# 2) 設定環境變數（密碼、port）
cp .env.example .env
nano .env                 # 改掉 POSTGRES_PASSWORD;要吃 80 port 就把 WEB_PORT 改 80

# 3) 建置並啟動（首次約 5–10 分鐘:裝相依 + 建模）
docker compose up --build -d

# 4) 確認狀態（api 要 healthy 才算就緒,首啟動會建南北兩網 + 暖機 ~2 分鐘）
docker compose ps
docker compose logs -f api      # 看到 "Application startup complete" 即可
```

開瀏覽器：`http://<server-ip>:8080`

## 常用維運指令

```bash
docker compose logs -f          # 看即時日誌(全部服務)
docker compose ps               # 看各容器狀態 / 健康度
docker compose restart api      # 只重啟後端
docker compose down             # 停止(保留 DB 資料)
docker compose down -v          # 停止並清掉 DB 資料(慎用)
git pull && docker compose up --build -d   # 更新到最新版
```

## 注意事項

- **首次啟動較慢**：後端會建立南/北兩個電網模型、跑潮流、背景暖機，約 1–2 分鐘才會 healthy；`depends_on` 已設成等 api healthy 後才放行前端，屬正常。
- **資料持久化**：DB 存在 named volume `pgdata`，`docker compose down` 不會掉、`down -v` 才會清。
- **正式對外**：建議在前面再擺一層 nginx/Caddy 反向代理綁網域 + Let's Encrypt 憑證（HTTPS）。內部 `web` 只開 8080，對外用反代轉 443。
- **改了密碼後**：若 DB volume 已存在舊密碼資料，改 `.env` 不會自動換密碼；要全新套用得先 `docker compose down -v`（會清資料）。
- **設定 `restart: unless-stopped`**：server 重開機後容器會自動拉回。
