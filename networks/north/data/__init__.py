"""
Data Layer - 校園配電系統數據層
負責管理系統拓撲、負載數據和參數
"""

from .network_structure import FEEDERS, MAIN_NETWORK, CABLE_PARAMETERS, TRANSFORMER_IMPEDANCE
from .load_data import DEFAULT_BUILDING_LOADS
from .parameters import (
    SYSTEM_PARAMS, CABLE_PARAMS, TRANSFORMER_PARAMS, LOAD_PARAMS,
    PANDAPOWER_CONFIG, PROTECTION_LIMITS, LOGGING_CONFIG,
    ParameterValidator
)

__all__ = [
    # 網路結構
    'FEEDERS',
    'MAIN_NETWORK',
    'CABLE_PARAMETERS',
    'TRANSFORMER_IMPEDANCE',
    
    # 負載數據
    'DEFAULT_BUILDING_LOADS',
    
    # 系統參數
    'SYSTEM_PARAMS',
    'CABLE_PARAMS',
    'TRANSFORMER_PARAMS',
    'LOAD_PARAMS',
    'PANDAPOWER_CONFIG',
    'PROTECTION_LIMITS',
    'LOGGING_CONFIG',
    'ParameterValidator',
]
