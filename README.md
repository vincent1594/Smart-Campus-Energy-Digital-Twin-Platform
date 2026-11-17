# 校園 11.4kV 配電系統分析系統 + 數位孿生平台

[![CI](https://github.com/vincent1594/SmartCampusEnergyDigitalTwinPlatform/actions/workflows/ci.yml/badge.svg)](https://github.com/vincent1594/SmartCampusEnergyDigitalTwinPlatform/actions/workflows/ci.yml)

使用 **PandaPower** 對校園 11.4kV 配電系統建模(**北電錶** X 棟受電 12 VCB + **南電錶** H1 棟受電 6 VCB,兩網獨立建模、平台可切換/合併總覽)並進行多情境潮流分析,並在其上包覆一層 **FastAPI + React** 數位孿生平台供營繕組查詢/模擬。採分層、模組化設計,負載與變壓器參數取自校園實際變壓器細部資料與 EMS 實測。

---

## 專案結構

```
X H1 meter/
├── requirements.txt  runtime.txt
├── Dockerfile  docker-compose.yml  DEPLOY.md   # Docker 自架部署 (web+api+db)
│
├── networks/                  # ⚡ 電網模型 (每網一個獨立套件,單一來源)
│   ├── registry.py            # 電網註冊表:webapi 依 network_id 取 provider
│   ├── north/                 # 北電錶 (X棟受電,12 VCB)
│   │   ├── provider.py        # 對外介面:FEEDERS / build_net() / run_power_flow()
│   │   ├── data/              # 📊 數據層
│   │   │   ├── network_structure.py   # 拓撲 (源自 docs/SLD/north_X/integrated.txt)
│   │   │   ├── load_data.py           # DEFAULT_BUILDING_LOADS (各台平均負載 + 功因)
│   │   │   ├── parameters.py          # 系統參數、損耗表、電壓規範、情境 SCENARIOS
│   │   │   ├── ems_loads.py           # EMS 實測各饋線負載分配 (含 VCB3 各棟實測校正)
│   │   │   ├── der.py                 # 微電網設備 (C/D、Z 棟太陽能/儲能/發電機;竣工圖 ESS-2.1)
│   │   │   └── area_loads.py  pv.py  academic_calendar.py
│   │   ├── models/            # 🔨 建模層:network_builder.py + XGBoost 模型 (*.pkl)
│   │   ├── analysis/          # 📈 分析層:power_flow (潮流) / xgb_forecast (饋線負載預測)
│   │   └── dataset/           # EMS 實測逐時功率 (11203-04、11205-06 各饋線)
│   └── south/                 # 南電錶 (H1 MVCB 受電,6 VCB;負載暫為佔位)
│       └── provider.py  data/  models/  analysis/   (負載暫為估算,尚無 EMS)
│
├── webapi/                    # 🌐 數位孿生平台 — FastAPI 後端 (包覆上述電網模型)
│   ├── main.py  config.py  state.py  engine.py  db.py
│   ├── domain.py  schemas.py  # 業務實體 / 對外 DTO
│   ├── data/transformer_specs.json # 變壓器銘牌/實測資料 (供規格明細;由校方 Excel 轉出的靜態檔)
│   ├── mappers/result_mapper.py    # ★ 翻譯層 (唯一碰 pandapower 欄位)
│   ├── services/  routes/     # 查詢彙總 / HTTP 端點
│
├── webui/                     # 💻 前端 (React + Vite + TypeScript + Ant Design)
│   └── src/  (pages/ components/ api/ auth/ focus/ scenario/ theme/ lib/)
│
├── tools/build_forecast_day.py  # 重建前端日曲線靜態檔 webui/public/forecast-day.json
├── tests/test_smoke.py        # 🧪 CI 測試:API 煙霧測試 + 潮流回歸 (不進部署映像)
├── .github/workflows/ci.yml   # GitHub Actions CI 設定
└── docs/SLD/          # 記事本 ASCII 單線圖 (拓撲原始依據,含 C/D、Z 微電網;網站不讀)
```

---

## 快速開始 (研究模型)

```powershell
# 1. 建立虛擬環境並安裝相依套件 (務必照 requirements.txt 釘選版本)
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. (選用) 重訓 XGBoost 模型
python -m networks.north.analysis.xgb_forecast
```

> ⚠️ **務必照 `requirements.txt` 釘選版本安裝**(尤其 `xgboost` / `numpy` / `pandapower`)。
> XGBoost 不同大版本載入同一份模型會給出不同預測,導致**本地與部署(Render)結果不一致**
> (例:同情境最大變壓器負載率 21.1% vs 16.8%)。部署端 Render 依此檔重建,本地請用同版本。

---

## 平台基準電網 (SCENARIOS)

網站開啟時建立的基準電網(首頁、設備查詢、潮流等皆依此):

| 電網 | 情境 | 負載來源 | 說明 |
|------|------|----------|------|
| 北網 | **S0** | `ems` | EMS 實測尖峰日 2023/06/08 14:00,直接用實測淨值 (PV 係數 0,不縮放) |
| 南網 | **S2** | `transformer` | MVCB 總盤 95 百分位 1,653 kW,依各台變壓器負載比例縮放 |

定義於 `networks/<north|south>/data/parameters.py` 的 `SCENARIOS`。
其他情境 (北網 S1、S1.1、S1.2、S2;南網 S1) **網站不使用**。
網站上的「時間點預測」「情境模擬」是依畫面輸入即時計算,不讀這張表。

---

## 負載分配方法

`network_builder` 依情境 `method` 決定各負載點有功 P,Q 由功因推算。所有方法皆考慮太陽能(PV)出力。

| method | 來源 | 說明 |
|--------|------|------|
| `ems` | EMS 實測各饋線 | 取某時刻實測 kW,按變壓器容量分配到負載點;**VCB3 用各棟實測校正** |
| `ems_profile` | EMS 平日日間平均占比 | 各饋線平均占比 × 指定總量 |
| `xgboost` | XGBoost 預測 (絕對) | 模型預測各饋線 kW,再按容量/VCB3 校正分配 |
| `xgboost_profile` | XGBoost 預測 (占比) | 用預測占比 × `load_kw` 目標,保留情境總量 |
| `area` | 面積 × 用途密度 | 樓地板面積估算 |
| `transformer` (預設) | 各台平均負載 × 分散係數 | `k = 目標總量 / Σ各台平均負載` |

```
PV 還原:EMS 實測/預測為「淨台電值」→ gross = 饋線淨值 + Σ該饋線PV → 按權重拆 gross → 再扣各棟 PV
Q_i = P_i × tan(arccos(pf_i))        ← pf 為各台運轉功因
```

- 負載原值(各台平均負載、功因)存於 `networks/north/data/load_data.py`,不被縮放覆寫。
- 已對應變壓器之並聯電容折入運轉功因;少數未對應/歧義負載沿用估計值(報告會標註)。
- **微電網棟 (D、Z)**:照上式扣完 PV 後,`network_builder` 再把 PV 加回負載(= 實際用電),
  改由太陽能發電設備 (sgen) 供給 → 母線淨功率不變,但看得到發電量。L/M/P 的 PV 仍從負載淨扣。

---

## 微電網 (C/D、Z 棟)

依技師用印竣工圖 ESS-2.1(2025-10-31 竣工)建模,設備資料單一來源為 `networks/north/data/der.py`,
拓撲草稿見 `docs/SLD/north_X/VCB7.txt`、`VCB2.txt`。

| 站別 | 掛接 | 太陽能 | 儲能 | 發電機 |
|------|------|--------|------|--------|
| C/D 棟 | `TR_CD` 300kVA 的 220V 母線 (VCB7) | PV_D1/D2/D3 合計 98.01 kWp | BESS_D1/D2 200 kW / 430 kWh | — |
| Z 棟 (西淮館) | `TR_Z_MAIN` 200kVA 的 220V 母線 (VCB2) | PV_Z 29.4 kWp | BESS_Z 25 kW / 105 kWh | GEN_Z LPG 14 kW |

- pandapower 元件:太陽能 = `sgen`(出力 = kWp × 日照係數,逆變器額定封頂);儲能 = `storage`;發電機 = `sgen(type="LPG")`。
- 基準情境:儲能待機、發電機停用;北網基準日照係數為 0,故太陽能出力顯示 0,選「規劃模擬」時間點可看出力。
- 介接變壓器 (200 / 75 / 50 kVA) 未建成潮流元件,設備直接掛 220V 母線(其損耗與壓降未計)。ACB 暫不建模。

---

## 主要參數

| 項目 | 數值 | 位置 |
|------|------|------|
| 主系統電壓 | 11.4 kV | `network_structure.py` |
| 低壓電壓 | 0.11 / 0.19 / 0.22 / 0.38 kV 等 | 各變壓器 |
| 系統頻率 | **60 Hz** | `parameters.py SYSTEM_PARAMS` |
| 電壓規範 | **0.95 – 1.05 pu** | `parameters.py VOLTAGE_LIMIT_MIN/MAX` |
| 電纜規格 | 38 / 60 / 250 mm² | `parameters.py CABLE_PARAMS` |
| 變壓器損耗 | 油式/乾式 × 容量查表 | `parameters.py TRANSFORMER_LOSS_TABLE` |
| 預設功率因數 | 0.9 (各台另有實測值) | `parameters.py LOAD_PARAMS` |

---

## 系統規模

**北電錶 (X 棟受電)**

- 12 條 VCB 饋線(VCB12 為純電容補償饋線,已建模為 CB_BUS + 600kVAr@13.8kV 並聯電容)
- 39 台變壓器(28 油式 / 11 乾式;含 2 台乾式停用備援)
- 40 個負載接入點
- 台電進線主纜 250mm²×3 顯式建模(長度未知,以假設值計算)
- R 棟並聯於 K_BUS 下游(電纜 + 600kVA + 150kVAr 電容)
- 微電網 8 台設備:太陽能 4、儲能 3、LPG 發電機 1(見上節)

**南電錶 (H1 棟 MVCB 受電)**

- 6 條 VCB 饋線(VCB5 為獨立電容饋線)
- 14 台變壓器,合計 11,000 kVA
- 14 個負載接入點:E 圖書資訊館、H1/H6 宿舍、U 優活館、O 高齡福祉館(即北電錶模型未含的建物)
- 負載為依變壓器實測運轉值估算,尚無 EMS 逐時資料 → 需量/歷史/預測功能暫不開放

南北合計 51 台變壓器,與校方 Excel 規格表 52 台僅差 1 台(北電 N 棟少計)。

---

## 常見操作

| 操作 | 命令 / 位置 |
|------|------|
| 重訓 XGBoost | `python -m networks.north.analysis.xgb_forecast` |
| 重建日曲線靜態檔 | `python -m tools.build_forecast_day`(改模型/負載/拓撲後必跑;`--check` 只檢查) |
| 改情境/負載目標 | 編輯 `networks/<north\|south>/data/parameters.py` 的 `SCENARIOS` |
| 改電壓規範 | 改 `VOLTAGE_LIMIT_MIN/MAX` |
| 改變壓器損耗 | 改 `TRANSFORMER_LOSS_TABLE` |
| 改負載/功因 | 改 `networks/<north\|south>/data/load_data.py` |
| 改電網拓撲 | 改 `networks/<north\|south>/data/network_structure.py`(唯一一份),並同步 `docs/SLD/` |
| 改微電網設備 | 改 `networks/north/data/der.py`(網站、地圖徽章、供電路徑自動跟著變) |
| 跑測試 | `python -m pytest tests -q`(與 CI 相同) |
| 刻意改模型後更新基準 | 改 `tests/test_smoke.py` 的 `BASELINE` 數值 |

---

## 程式化呼叫

```python
from networks.north.models.network_builder import build_network_s1_baseline
from networks.north.analysis.power_flow import run_s1_baseline_powerflow

net = build_network_s1_baseline()
net, results = run_s1_baseline_powerflow(net=net)   # results["system_stats"] 等
```

> 南網同理,改 import `networks.south...`;或經 `networks.registry.get_provider("south")` 取得統一介面。
> 注意:情境由環境變數 `BAYESGRID_SCENARIO` 決定(北網預設 S0、南網預設 S2)。

---

## 數位孿生平台 (Campus Digital Twin V1)

`webapi/` 是給營繕組使用的 Web 平台後端,**包覆**上述研究模型當底層計算引擎,
對外只暴露業務語意欄位(看不到 pandapower 原始欄位)。研究碼 0 改動,僅被 import。

### 後端

```powershell
# 從 repo 根啟動 (原生 import networks.*,無 sys.path hack)
python -m uvicorn webapi.main:app --reload --port 8126
# API 文件:http://127.0.0.1:8126/docs
```

啟動時 `engine.build_base()` 建網 + 跑潮流一次,結果快取於 `state`(唯讀),由各 route 共用。

> 電網相關端點皆帶電網代號前綴 `/api/{north|south}/...`(下表省略);`GET /api/networks` 列出可切換電網。

| 端點 | 說明 |
|------|------|
| `GET /api/dashboard` | KPI 摘要 + 系統狀態 |
| `GET /api/buildings[/{id}]` | 建築搜尋 / 詳情 + 供電路徑(微電網棟另帶本地電源與逆送功率) |
| `GET /api/assets/{transformers\|vcbs\|feeders}` | 設備清單 (容量←model、負載率←result);變壓器、饋線另可 `/{id}` 取單筆 |
| `GET /api/assets/transformer-specs` | 變壓器銘牌/實測資料 (供營繕核對) |
| `GET /api/assets/der` | 微電網設備清單 + 基準出力 (無微電網的網回空清單) |
| `GET /api/topology` | 拓樸 (台電→VCB→饋線→變壓器→建築 / 微電網設備) |
| `GET /api/powerflow` | base 潮流結果(含微電網設備出力 `der_outputs`) |
| `POST /api/scenario/run` | 情境 what-if 模擬 (改負載/容量/線長) before/after |
| `POST /api/scenario/forecast` | 指定時點 + PV → XGBoost 預測負載後模擬 |

分層:`routes → services → mappers(翻譯)→ engine(橋接既有 builder/power_flow)`。
Scenario 一律 `deepcopy(base_net)` 後改 clone 再 runpp,base 永不被汙染。

### 前端

```powershell
cd webui
npm install
npm run dev          # http://localhost:5173 (dev 透過 vite proxy 轉 127.0.0.1:8126)
```

- 導覽列:校園總覽(`/`)、設備查詢、微電網(`/microgrid`)、規劃模擬、能源管理、歷史趨勢、告警紀錄、報表匯出、驗證中心。
- 校園地圖:C/D/Z 棟標再生能源徽章(位置避開建物與文字);供電路徑在變壓器與建築間顯示低壓母線與本地電源。
- 三大全站 Context:
  - **FocusContext** — 目前關注對象(建築/變壓器/VCB/饋線/電源),連動地圖聚光燈、詳情面板、模擬預填。
  - **ActiveScenarioContext** — 模擬結果疊加,全頁負載率色彩即時切換 base ↔ scenario(不重抓 API)。
  - **ThemeContext** — 深/淺色主題。

---

## 持續整合 (CI)

每次 push 到 `main` 或開 PR,GitHub Actions 會在乾淨的 Ubuntu 環境從零安裝並驗證整個專案,結果顯示在 commit 旁(✓ 通過 / ✗ 失敗)與上方徽章。目的:**在部署前抓出「這次修改把東西弄壞了」**,而不是上線後才發現。

| Job | 檢查內容 | 擋下的問題 |
|------|------|------|
| 後端 (API + 潮流回歸) | 後端啟動;南北網 `dashboard` / `powerflow` / `buildings` / `topology` 回 200 | 語法錯、漏寫 `requirements.txt`、import 失敗 |
| | 潮流收斂、電壓 0.90–1.10 pu、損失 < 10% 負載、變壓器負載率 < 150% | 改壞拓撲/參數導致不收斂或物理不合理 |
| | 總負載、系統損失、最大變壓器負載率與基準相差 ≤ 2% | 沒報錯但數字悄悄變了 (套件版本漂移、誤改資料) |
| 前端 (型別檢查 + build) | `npm ci` → `npm run build`(含 `tsc`) | TypeScript 型別錯、import 打錯導致網站 build 失敗 |

- 本機先跑:`python -m pytest tests -q`(需 `pip install pytest httpx`)
- **刻意**修改模型使數字合理變動時,CI 回歸測試會失敗 → 確認新數值正確後更新 `tests/test_smoke.py` 的 `BASELINE`
- `tests/`、`.github/` 已列入 `.dockerignore`,不進部署映像

---

## 後續工作 (Roadmap)

**研究模型**
- [ ] **短路電流分析(下一階段)**:三相短路 `calc_sc` 對照 VCB 遮斷額定
- [ ] N-1 設備停機情境
- [ ] 南電錶模型校正(負載尚為估算)

**數位孿生平台**
- [x] 微電網建模 + 微電網頁 + 地圖徽章 + 供電路徑本地電源
- [ ] 規劃模擬:儲能充放電 / 發電機啟停控制
- [ ] 停電孤島供電標示與續航時間(待確認 D 棟自動孤島範圍)
- [ ] 即時監控(需接 EMS 即時資料)
- [x] CI:GitHub Actions 自動測試 (API + 潮流回歸 + 前端 build)

---

## 技術棧

- **計算引擎**: PandaPower 3.x｜**數據處理**: Pandas, NumPy, NetworkX｜**預測**: XGBoost, scikit-learn
- **平台後端**: FastAPI + Uvicorn｜**前端**: React + Vite + TypeScript, Ant Design, React Flow, ECharts
- **測試 / CI**: pytest + FastAPI TestClient｜GitHub Actions
- **語言**: Python 3.12 / TypeScript

---

**最後更新**: 2026-11-17 ｜ **版本**: v1.0.0 (南北電錶整合 + 數位孿生平台 + C/D、Z 微電網)
