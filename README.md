# 校園 11.4kV 配電系統分析系統

使用 **PandaPower** 對校園 11.4kV 配電系統建模並進行多情境潮流分析。採分層、模組化設計,負載與變壓器參數取自校園實際變壓器細部資料。

---

## 專案結構

```
論文實驗2/
├── main.py                    # ★ 主程式:一鍵跑全部/指定情境
├── run_s1_baseline.py         # 單情境引擎 (建模→潮流→報告;被 main 呼叫)
├── requirements.txt
├── README.md                  # 本文件 (使用手冊)
├── COMPLETION_REPORT.md       # 進度/成果報告
├── validation_report.json     # 數據層驗證輸出
│
├── data/                      # 📊 數據層
│   ├── network_structure.py   # 饋線/母線/變壓器/電纜 拓撲 (含 R 棟、台電進線)
│   ├── load_data.py           # DEFAULT_BUILDING_LOADS (各台真實平均負載 + 功因)
│   ├── parameters.py          # 系統參數、損耗表、電壓規範、情境 SCENARIOS
│   └── test_data.py           # 數據驗證 (run_validation)
│
├── models/                    # 🔨 建模層
│   └── network_builder.py     # build_network_s1_baseline() 建 PandaPower 網路
│
├── analysis/                  # 📈 分析層
│   ├── power_flow.py          # run_s1_baseline_powerflow() 牛頓-拉夫遜潮流
│   └── results_export.py      # export_s1_results() 報告(md/txt)+ CSV
│
├── utils/                     # 🛠️ 工具層 (預留)
│
└── results/                   # 各情境輸出
    ├── S1/   S1.1/   S1.2/     # 每情境:報告 .md/.txt + 4 個 .csv
```

---

## 快速開始

```powershell
# 1. 安裝相依套件 (需 pandapower 3.x)
pip install -r requirements.txt

# 2. 執行分析
python main.py              # 跑全部情境 (S1, S1.1, S1.2)
python main.py S1.2         # 只跑指定情境
python main.py S1 S1.1      # 跑多個

# 3. (選用) 僅驗證數據層
python -m data.test_data
```

結果輸出於 `results/<情境>/`,含 10 章中文報告(`.md` / `.txt`)與 4 個 CSV(母線電壓、電纜負載、變壓器負載、負載明細)。

---

## 情境 (SCENARIOS)

定義於 `data/parameters.py`。負載分布取自變壓器實測平均負載比例,再以**分散係數**縮放到各情境的系統同時負載。

| 情境 | 期間 / 類型 | 系統同時負載 |
|------|------------|------------|
| S1   | 2018年5月 半尖峰 | 4,608 kW |
| S1.1 | 2018年5月 離峰 | 3,848 kW |
| S1.2 | 2018年5月 週六半尖峰 | 2,432 kW |

新增情境:在 `SCENARIOS` 加一筆 `{"period": "...", "load_kw": ...}` 即可。

---

## 負載分配方法

```
P_i = P_raw,i × k        k = 系統同時負載 / Σ(各台平均負載)   ← 分散係數
Q_i = P_i × tan(arccos(pf_i))                                 ← pf 為各台運轉功因
```

- 負載原值(各台平均負載、功因)存於 `data/load_data.py`,不被縮放覆寫。
- 已對應變壓器之並聯電容折入運轉功因;少數未對應/歧義負載沿用估計值(報告會標註)。

---

## 主要參數

| 項目 | 數值 | 位置 |
|------|------|------|
| 主系統電壓 | 11.4 kV | `network_structure.py` |
| 低壓電壓 | 0.22 / 0.38 kV | 各變壓器 |
| 系統頻率 | **60 Hz** | `parameters.py SYSTEM_PARAMS` |
| 電壓規範 | **0.95 – 1.05 pu** | `parameters.py VOLTAGE_LIMIT_MIN/MAX` |
| 電纜規格 | 38 / 60 / 250 mm² | `parameters.py CABLE_PARAMS` |
| 變壓器損耗 | 油式/乾式 × 容量查表 | `parameters.py TRANSFORMER_LOSS_TABLE` |
| 預設功率因數 | 0.9 (各台另有實測值) | `parameters.py LOAD_PARAMS` |

---

## 系統規模

- 11 條 VCB 饋線(VCB12 為 13.8kV 電容饋線,未建模)
- 37 台變壓器(28 油式 / 9 乾式;含 2 台停用備援)
- 40 個負載接入點
- 台電進線主纜 250mm²×3 顯式建模(長度未知,以假設值計算)
- R 棟並聯於 K_BUS 下游(109.2m 電纜 + 600kVA + 150kVAr 電容)

---

## 常見操作

| 操作 | 命令 |
|------|------|
| 跑全部情境 | `python main.py` |
| 跑單一情境 | `python main.py S1.2` |
| 驗證數據層 | `python -m data.test_data` |
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

## 技術棧

- **框架**: PandaPower 3.4.0
- **數據處理**: Pandas, NumPy
- **語言**: Python 3.12

---

**最後更新**: 2026-06-05 ｜ **版本**: 0.5.0 (多情境潮流分析)
