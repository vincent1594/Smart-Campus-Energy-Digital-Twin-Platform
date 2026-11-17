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
| `web` | nginx：前端靜態檔 + 反代 `/api` | port **10600**（`WEB_PORT`，可改） |
| `api` | FastAPI + pandapower + XGBoost（內含模型與量測資料） | port **10601**（`API_PORT`,供直打後端;可只走內部） |
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
cd "X H1 meter"         # 或 clone 下來的資料夾名

# 2) 設定環境變數（密碼、port）
cp .env.example .env
nano .env                 # 改掉 POSTGRES_PASSWORD;預設 WEB_PORT=10600、要吃 80 port 就改 80

# 3) 建置並啟動（首次約 5–10 分鐘:裝相依 + 建模）
docker compose up --build -d

# 4) 確認狀態（api 要 healthy 才算就緒,首啟動會建南北兩網 + 暖機 ~2 分鐘）
docker compose ps
docker compose logs -f api      # 看到 "Application startup complete" 即可
```

開瀏覽器：`http://<server-ip>:10600`

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
- **正式對外**：建議在前面再擺一層 nginx/Caddy 反向代理綁網域 + Let's Encrypt 憑證（HTTPS）。內部 `web` 只開 10600，對外用反代轉 443。
- **改了密碼後**：若 DB volume 已存在舊密碼資料，改 `.env` 不會自動換密碼；要全新套用得先 `docker compose down -v`（會清資料）。
- **設定 `restart: unless-stopped`**：server 重開機後容器會自動拉回。

## 疑難排解

### Windows 開不了頁面 / 綁埠失敗 `bind: An attempt was made to access a socket in a way forbidden by its access permissions`

**症狀**：`docker compose up` 時 web 或 api 起不來,報上面這行;或 `http://localhost:10600` 打不開,但 `docker ps` 看容器其實有在跑。

**原因**：Windows 的 Hyper-V/WSL2 在開機時會**動態保留**一批 100 埠的區塊(例如 `10575–10674`),剛好把預設的 `WEB_PORT=10600` / `API_PORT=10601` 吃掉,導致 Docker 無法綁這些埠。

**先確認**是不是踩到保留區(看你的埠有沒有落在某段範圍內):
```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

**解法(擇一)**:

1. **把埠釘死成持久排除(保留 10600/10601,推薦)** — 開**系統管理員** PowerShell 跑:
   ```powershell
   net stop winnat
   netsh int ipv4 add excludedportrange protocol=tcp startport=10600 numberofports=2 store=persistent
   net start winnat
   ```
   跑完再 `show excludedportrange`,`10600 10601` 會標成 `*`(Administered)—— 這種是你自己釘的,程式可以綁,且 Hyper-V 不會再搶。`store=persistent` 重開機後仍有效。之後 `docker compose up -d` 即可。

2. **換一個沒被保留的埠** — 改 `.env` 的 `WEB_PORT`/`API_PORT`(挑上面 `show` 結果所有區塊之外的值),再 `docker compose up -d --force-recreate`。

> 註:同一台機器歷史上也踩過 `8080`(被 `8079–8178` 擋)才改用其他埠。這些區塊每次開機可能位移,若哪天又打不開,先 `show excludedportrange` 對一下再重跑上面步驟。
