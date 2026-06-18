# 校園 11.4kV 配電系統分析系統 + 數位孿生平台

使用 **PandaPower** 對校園(北校區)11.4kV 配電系統建模並進行多情境潮流分析,並在其上包覆一層 **FastAPI + React** 數位孿生平台供營繕組查詢/模擬。採分層、模組化設計,負載與變壓器參數取自校園實際變壓器細部資料與 EMS 實測。

---

## 專案結構

```
論文實驗X電錶/
├── main.py                    # ★ 主程式:一鍵跑全部/指定情境
├── run_s1_baseline.py         # 單情境引擎 (建模→潮流→報告;被 main 呼叫)
├── requirements.txt  runtime.txt
├── README.md                  # 本文件 (使用手冊)
├── COMPLETION_REPORT.md       # 進度/成果報告
├── validation_report.json     # 數據層驗證輸出
│
├── data/                      # 📊 數據層
│   ├── network_structure.py   # 饋線/母線/變壓器/電纜 拓撲 (12 VCB、R 棟、台電進線、VCB12 電容)
│   ├── load_data.py           # DEFAULT_BUILDING_LOADS (各台真實平均負載 + 功因)
│   ├── parameters.py          # 系統參數、損耗表、電壓規範、情境 SCENARIOS
│   ├── ems_loads.py           # EMS 實測各饋線負載分配 (含 VCB3 各棟實測校正)
│   ├── area_loads.py          # 樓地板面積 × 用途密度 負載法
│   ├── pv.py                  # 各建築太陽能出力 (供負載淨值還原)
│   ├── build_transformer_specs.py # 由 Excel 重建變壓器銘牌 JSON
│   └── test_data.py           # 數據驗證 (run_validation)
│
├── models/                    # 🔨 建模層
│   ├── network_builder.py     # build_network_s1_baseline() 建 PandaPower 網路
│   └── xgb_feeder_models.pkl  # 訓練好的各饋線 XGBoost 模型
│
├── analysis/                  # 📈 分析層
│   ├── power_flow.py          # run_s1_baseline_powerflow() 牛頓-拉夫遜潮流
│   ├── xgb_forecast.py        # 饋線負載 XGBoost 預測 (5月訓/6月測)
│   ├── experiments.py         # 預測實驗 (誤差評估、散布圖)
│   └── results_export.py      # export_s1_results() 報告(md/txt)+ CSV
│
├── EMS/                       # EMS 實測逐時功率 (11205-06 北校區, 2023/05-06)
├── results/                   # 各情境輸出 (S0/ S1/ S1.1/ S1.2/ S2/ + experiments/)
├── tools/verify_engine.py     # 平台驗收腳本
├── utils/                     # 🛠️ 工具層 (預留)
│
├── webapi/                    # 🌐 數位孿生平台 — FastAPI 後端 (包覆上述研究模型)
│   ├── main.py  config.py  state.py
│   ├── engine.py              # 橋接 build_network / power_flow + 解析 domain
│   ├── domain.py  schemas.py  # 業務實體 / 對外 DTO
│   ├── powerflow.py  topology.py  building_names.py
│   ├── data/transformer_specs.json # 變壓器銘牌/實測資料 (供規格明細)
│   ├── mappers/result_mapper.py    # ★ 翻譯層 (唯一碰 pandapower 欄位)
│   ├── services/             # 查詢彙總 (dashboard/building/asset/topology/powerflow/scenario)
│   └── routes/              # HTTP 端點
│
└── webui/                     # 💻 前端 (React + Vite + TypeScript + Ant Design)
    └── src/  (pages/ components/ api/ focus/ scenario/ theme/ lib/)
```

---

## 快速開始 (研究模型)

```powershell
# 1. 建立虛擬環境並安裝相依套件 (務必照 requirements.txt 釘選版本)
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. 執行分析
python main.py              # 跑全部情境 (S0, S1, S1.1, S1.2, S2)
python main.py S1.1         # 只跑指定情境
python main.py S1 S1.1      # 跑多個

# 3. (選用) 僅驗證數據層 / 訓練 XGBoost 模型
python -m data.test_data
python analysis/xgb_forecast.py
```

結果輸出於 `results/<情境>/`,含中文報告(`.md` / `.txt`)與 4 個 CSV(母線電壓、電纜負載、變壓器負載、負載明細)。

> ⚠️ **務必照 `requirements.txt` 釘選版本安裝**(尤其 `xgboost` / `numpy` / `pandapower`)。
> XGBoost 不同大版本載入同一份模型會給出不同預測,導致**本地與部署(Render)結果不一致**
> (例:同情境最大變壓器負載率 21.1% vs 16.8%)。部署端 Render 依此檔重建,本地請用同版本。

---

## 情境 (SCENARIOS)

定義於 `data/parameters.py`。每情境指定**負載來源方法 (method)**、時間點與太陽能出力係數 (pv_factor);
`xgboost_profile` 法另以 `load_kw` 為系統同時負載目標縮放。

| 情境 | 期間 / 類型 | 負載方法 | 系統同時負載 | PV 係數 |
|------|------------|----------|------------|--------|
| S0   | EMS 實測尖峰 2023/06/08 14:00 | `ems` | 實測 (不縮放) | 0.8 |
| S1   | 2023/03/01 半尖峰 | `xgboost_profile` | 1,860 kW | 0.4 |
| S1.1 | 2026/06/08 14:00 夏季午後 | `xgboost_profile` | 3,400 kW | 0.75 |
| S1.2 | 2026/06/08 09:00 夏季上午 | `xgboost_profile` | 2,470 kW | 0.5 |
| S2   | XGBoost 預測 2026/06/08 14:00 | `xgboost` | 預測 (不縮放) | 0.8 |

執行時以環境變數 `BAYESGRID_SCENARIO` 選擇(預設 S1);`run_s1_baseline.py` / `main.py` 會自動設定。
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

- 負載原值(各台平均負載、功因)存於 `data/load_data.py`,不被縮放覆寫。
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
| 跑全部情境 | `python main.py` |
| 跑單一情境 | `python main.py S1.1` |
| 驗證數據層 | `python -m data.test_data` |
| 重訓 XGBoost | `python analysis/xgb_forecast.py` |
| 重建變壓器銘牌 JSON | `python data/build_transformer_specs.py` |
| 改情境/負載目標 | 編輯 `data/parameters.py` 的 `SCENARIOS` |
| 改電壓規範 | 改 `VOLTAGE_LIMIT_MIN/MAX` |
| 改變壓器損耗 | 改 `TRANSFORMER_LOSS_TABLE` |
| 改負載/功因 | 改 `data/load_data.py` |

---

## 程式化呼叫

```python
from models.network_builder import build_network_s1_baseline
from analysis.power_flow import run_s1_baseline_powerflow
from analysis.results_export import export_s1_results

net = build_network_s1_baseline()
net, results = run_s1_baseline_powerflow(net=net)
export_s1_results(net, results, output_dir="results/S1")
```

> 注意:情境由環境變數 `BAYESGRID_SCENARIO` 決定(預設 S1),`run_s1_baseline.py` / `main.py` 會自動設定。

---

## 數位孿生平台 (Campus Digital Twin V1)

`webapi/` 是給營繕組使用的 Web 平台後端,**包覆**上述研究模型當底層計算引擎,
對外只暴露業務語意欄位(看不到 pandapower 原始欄位)。研究碼 0 改動,僅被 import。

### 後端

```powershell
# 從 repo 根啟動 (原生 import data/models/analysis,無 sys.path hack)
python -m uvicorn webapi.main:app --reload --port 8126
# API 文件:http://127.0.0.1:8126/docs
# 驗收:python -m tools.verify_engine
```

啟動時 `engine.build_base()` 建網 + 跑潮流一次,結果快取於 `state`(唯讀),由各 route 共用。

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

## 技術棧

- **計算引擎**: PandaPower 3.x｜**數據處理**: Pandas, NumPy, NetworkX｜**預測**: XGBoost, scikit-learn
- **平台後端**: FastAPI + Uvicorn｜**前端**: React + Vite + TypeScript, Ant Design, React Flow, ECharts
- **語言**: Python 3.12 / TypeScript

---

**最後更新**: 2026-06-18 ｜ **版本**: 0.7.0 (多情境潮流 + 數位孿生平台 V1)
