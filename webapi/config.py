"""全域設定。

本平台不自造資料:真相來源是 networks/<net>/ 下的既有研究模型
  networks/<net>/data/network_structure.py  (FEEDERS 拓樸)
  networks/<net>/models/network_builder.py  (build_network_s1_baseline)
  networks/<net>/analysis/power_flow.py     (run_s1_baseline_powerflow)
webapi 與 networks 是同一個 repo 根下的 sibling 套件,故從 repo 根啟動
(python -m uvicorn webapi.main:app) 即可原生 import,無需任何 sys.path 操作。
本層只負責「翻譯 + API」。
"""
from __future__ import annotations

# 系統標稱電壓 (台電 11.4kV 進線) —— 僅供顯示/換算,不參與建模 (建模在既有 builder)
SYSTEM_HV_KV = 11.4
SOURCE_NAME = "台電 (TPC) 11.4kV"

# 前端開發 server 來源 (CORS)
FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173","https://smart-campus-energy-digital-twin-71ut.onrender.com"]
