"""
Campus 11.4kV Distribution Network Analysis System
校園配電系統分析系統

分層結構:
- data/        : 數據層 (拓撲、負載、參數、EMS、預測特徵)
- models/      : 建模層 (PandaPower網路構建)
- analysis/    : 分析層 (潮流、XGBoost 預測、實驗、結果導出)
- webapi/      : 數位孿生平台後端 (FastAPI,包覆上述模型)
"""

__version__ = "0.7.0"
__author__ = "Power System Analysis Team"

import logging

# 配置根日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
