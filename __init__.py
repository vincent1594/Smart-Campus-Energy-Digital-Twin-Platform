"""
Campus 11.4kV Distribution Network Analysis System
校園配電系統分析系統

分層結構:
- networks/<north|south>/ : 各電網模型 (data 數據層 / models 建模層 / analysis 分析層 / EMS)
- webapi/                 : 數位孿生平台後端 (FastAPI,透過 networks.registry 包覆各網模型)
- webui/                  : 前端 (React + Vite)
"""

__version__ = "0.7.0"
__author__ = "Power System Analysis Team"

import logging

# 配置根日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
