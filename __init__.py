"""
Campus 11.4kV Distribution Network Analysis System
校園配電系統分析系統

分層結構:
- data/        : 數據層 (拓撲、負載、參數)
- models/      : 建模層 (PandaPower網路構建)
- analysis/    : 分析層 (潮流、故障、結果導出)
- utils/       : 工具層 (可視化、導出、輔助函數)
"""

__version__ = "0.1.0"
__author__ = "Power System Analysis Team"

import logging

# 配置根日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
