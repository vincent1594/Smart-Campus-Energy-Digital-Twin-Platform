# 校園 11.4kV 配電系統分析系統 + 數位孿生平台

使用 **PandaPower** 對校園(北校區)11.4kV 配電系統建模並進行多情境潮流分析,並在其上包覆一層 **FastAPI + React** 數位孿生平台供營繕組查詢/模擬。採分層、模組化設計,負載與變壓器參數取自校園實際變壓器細部資料與 EMS 實測。

---

## 專案結構

```
論文實驗X電錶/
├── requirements.txt  runtime.txt
├── Dockerfile  docker-compose.yml  DEPLOY.md   # Docker 自架部署 (web+api+db)
│
├── networks/                  # ⚡ 電網模型 (每網一個獨立套件,單一來源)
│   ├── registry.py            # 電網註冊表:webapi 依 network_id 取 provider
│   ├── north/                 # 北電錶 (X棟受電,12 VCB)
│   │   ├── provider.py        # 對外介面:FEEDERS / build_net() / run_power_flow()
│   │   ├── data/              # 📊 數據層
│   │   │   ├── network_structure.py   # 拓撲 (源自 docs/單線圖原稿/北電錶_X/整合.txt)
│   │   │   ├── load_data.py           # DEFAULT_BUILDING_LOADS (各台平均負載 + 功因)
│   │   │   ├── parameters.py          # 系統參數、損耗表、電壓規範、情境 SCENARIOS
│   │   │   ├── ems_loads.py           # EMS 實測各饋線負載分配 (含 VCB3 各棟實測校正)
│   │   │   ├── area_loads.py  pv.py  academic_calendar.py  weather.py
│   │   │   ├── build_transformer_specs.py  # Excel → webapi/data/transformer_specs.json
│   │   │   ├── build_breaker_inventory.py  # breaker_inventory.md → 斷路器額定清冊 xlsx/csv
│   │   │   └── test_data.py           # 數據驗證
│   │   ├── models/            # 🔨 建模層:network_builder.py + XGBoost 模型 (*.pkl)
│   │   ├── analysis/          # 📈 分析層:power_flow (潮流) / xgb_forecast (饋線負載預測)
│   │   └── EMS/               # EMS 實測逐時功率 + 永康站氣溫 CSV
│   └── south/                 # 南電錶 (H1 MVCB 受電,6 VCB;負載暫為佔位)
│       └── provider.py  data/  models/  analysis/  EMS/
│
├── webapi/                    # 🌐 數位孿生平台 — FastAPI 後端 (包覆上述電網模型)
│   ├── main.py  config.py  state.py  engine.py  db.py
│   ├── domain.py  schemas.py  # 業務實體 / 對外 DTO
│   ├── data/transformer_specs.json # 變壓器銘牌/實測資料 (供規格明細)
│   ├── mappers/result_mapper.py    # ★ 翻譯層 (唯一碰 pandapower 欄位)
│   ├── services/  routes/     # 查詢彙總 / HTTP 端點
│
├── webui/                     # 💻 前端 (React + Vite + TypeScript + Ant Design)
│   └── src/  (pages/ components/ api/ auth/ focus/ scenario/ theme/ lib/)
│
├── tools/verify_engine.py     # 平台驗收 (南北兩網建網 + 潮流 + domain 解析)
└── docs/                      # V1 驗收校正清單、單線圖原稿/ (記事本 ASCII 原稿)
```

> 📚 **論文素材不在本 repo**:論文草稿、各情境潮流報告 (`results/`)、報告產生器 (`main.py`、
> `run_s1_baseline.py`、`results_export.py`)、預測實驗與論文圖程式,已移至 repo 外的
> `bayesgrid/論文素材/`(含重跑說明 README)。本 repo 只放平台部署需要的程式與資料。

---

## 快速開始 (研究模型)

```powershell
# 1. 建立虛擬環境並安裝相依套件 (務必照 requirements.txt 釘選版本)
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. 驗收模型 (南北兩網建網 + 潮流)
python -m tools.verify_engine

# 3. (選用) 驗證數據層 / 重訓 XGBoost 模型
python -m networks.north.data.test_data
python -m networks.north.analysis.xgb_forecast
```

要產生論文用的各情境潮流報告(md/txt + CSV),見 `bayesgrid/論文素材/README.md`。

> ⚠️ **務必照 `requirements.txt` 釘選版本安裝**(尤其 `xgboost` / `numpy` / `pandapower`)。
> XGBoost 不同大版本載入同一份模型會給出不同預測,導致**本地與部署(Render)結果不一致**
> (例:同情境最大變壓器負載率 21.1% vs 16.8%)。部署端 Render 依此檔重建,本地請用同版本。

---

## 情境 (SCENARIOS)

定義於 `networks/north/data/parameters.py`。每情境指定**負載來源方法 (method)**、時間點與太陽能出力係數 (pv_factor);
`xgboost_profile` 法另以 `load_kw` 為系統同時負載目標縮放。

| 情境 | 期間 / 類型 | 負載方法 | 系統同時負載 | PV 係數 |
|------|------------|----------|------------|--------|
| S0   | EMS 實測尖峰日 2023/06/08 14:00 (**北網平台基準**) | `ems` | 實測 (不縮放) | 0.0 |
| S1   | 2023/03/01 半尖峰 | `xgboost_profile` | 1,860 kW | 0.4 |
| S1.1 | 2026/06/08 14:00 夏季午後 | `xgboost_profile` | 3,400 kW | 0.75 |
| S1.2 | 2026/06/08 09:00 夏季上午 | `xgboost_profile` | 2,470 kW | 0.5 |
| S2   | XGBoost 預測 2026/06/08 14:00 | `xgboost` | 預測 (不縮放) | 0.8 |

以環境變數 `BAYESGRID_SCENARIO` 選擇,北網預設 **S0**(平台基準電網即依此建);南網情境另定義於 `networks/south/data/parameters.py`(預設 S2)。
新增情境:在 `SCENARIOS` 加一筆(指定 `method`、`timestamp`、`pv_factor`、視需要 `load_kw`)即可。

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
PV 還原:EMS/預測為「淨台電值」→ gross = 饋線淨值 + Σ該饋線PV → 按權重拆 gross → 再扣各棟 PV
Q_i = P_i × tan(arccos(pf_i))        ← pf 為各台運轉功因
```

- 負載原值(各台平均負載、功因)存於 `networks/north/data/load_data.py`,不被縮放覆寫。
- 已對應變壓器之並聯電容折入運轉功因;少數未對應/歧義負載沿用估計值(報告會標註)。

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

- 12 條 VCB 饋線(VCB12 為純電容補償饋線,已建模為 CB_BUS + 600kVAr@13.8kV 並聯電容)
- 39 台變壓器(28 油式 / 11 乾式;含 2 台乾式停用備援)
- 40 個負載接入點
- 台電進線主纜 250mm²×3 顯式建模(長度未知,以假設值計算)
- R 棟並聯於 K_BUS 下游(電纜 + 600kVA + 150kVAr 電容)

---

## 常見操作

| 操作 | 命令 / 位置 |
|------|------|
| 驗收模型 | `python -m tools.verify_engine` |
| 驗證數據層 | `python -m networks.north.data.test_data` |
| 重訓 XGBoost | `python -m networks.north.analysis.xgb_forecast` |
| 重建變壓器銘牌 JSON | `python -m networks.north.data.build_transformer_specs` |
| 改情境/負載目標 | 編輯 `networks/north/data/parameters.py` 的 `SCENARIOS` |
| 改電壓規範 | 改 `VOLTAGE_LIMIT_MIN/MAX` |
| 改變壓器損耗 | 改 `TRANSFORMER_LOSS_TABLE` |
| 改負載/功因 | 改 `networks/north/data/load_data.py` |
| 改電網拓撲 | 改 `networks/<north\|south>/data/network_structure.py`(唯一一份) |

---

## 程式化呼叫

```python
from networks.north.models.network_builder import build_network_s1_baseline
from networks.north.analysis.power_flow import run_s1_baseline_powerflow

net = build_network_s1_baseline()
net, results = run_s1_baseline_powerflow(net=net)   # results["system_stats"] 等
```

> 注意:情境由環境變數 `BAYESGRID_SCENARIO` 決定(北網預設 S0)。

---

## 數位孿生平台 (Campus Digital Twin V1)

`webapi/` 是給營繕組使用的 Web 平台後端,**包覆**上述研究模型當底層計算引擎,
對外只暴露業務語意欄位(看不到 pandapower 原始欄位)。研究碼 0 改動,僅被 import。

### 後端

```powershell
# 從 repo 根啟動 (原生 import networks.*,無 sys.path hack)
python -m uvicorn webapi.main:app --reload --port 8126
# API 文件:http://127.0.0.1:8126/docs
# 驗收:python -m tools.verify_engine
```

啟動時 `engine.build_base()` 建網 + 跑潮流一次,結果快取於 `state`(唯讀),由各 route 共用。

> 電網相關端點皆帶電網代號前綴 `/api/{north|south}/...`(下表省略);`GET /api/networks` 列出可切換電網。

| 端點 | 說明 |
|------|------|
| `GET /api/dashboard` | KPI 摘要 + 系統狀態 |
| `GET /api/buildings[/{id}]` | 建築搜尋 / 詳情 + 供電路徑 |
| `GET /api/assets/{transformers\|vcbs\|feeders}[/{id}]` | 設備查詢 (容量←model、負載率←result) |
| `GET /api/assets/transformer-specs` | 變壓器銘牌/實測資料 (供營繕核對) |
| `GET /api/topology` | React Flow 拓樸 (台電→VCB→饋線→變壓器→建築) |
| `GET /api/powerflow` | base 潮流結果 |
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

- 分頁:校園總覽(`/`)、地圖(`/map`)、建築查詢、設備查詢、規劃模擬、告警、報表匯出。
- 三大全站 Context:
  - **FocusContext** — 目前關注對象(建築/變壓器/VCB/饋線/電源),連動地圖聚光燈、詳情面板、模擬預填。
  - **ActiveScenarioContext** — 模擬結果疊加,全頁負載率色彩即時切換 base ↔ scenario(不重抓 API)。
  - **ThemeContext** — 深/淺色主題。

---

## 後續工作 (Roadmap)

**研究模型**
- [ ] 補建模型缺漏建物(E館、H1、H6、U、污水廠、O)
- [ ] 故障分析 / 短路計算
- [ ] N-1 設備停機情境
- [ ] South 校區(南電錶)建模(目前僅北校區)

**數位孿生平台**
- [ ] 前端 Placeholder 頁:歷史趨勢 / 即時監控 / 單線圖總覽(需逐時資料管線;EMS 已有逐時實測可接)
- [ ] 日負載曲線改用 EMS 真實資料(目前為示意曲線)
- [ ] V2 綠能管理:PV / ESS 一等公民資產建模 + 新增分頁

---

## 技術棧

- **計算引擎**: PandaPower 3.x｜**數據處理**: Pandas, NumPy, NetworkX｜**預測**: XGBoost, scikit-learn
- **平台後端**: FastAPI + Uvicorn｜**前端**: React + Vite + TypeScript, Ant Design, React Flow, ECharts
- **語言**: Python 3.12 / TypeScript

---

**最後更新**: 2026-11-15 ｜ **版本**: 0.7.0 (多情境潮流 + 數位孿生平台 V1)
