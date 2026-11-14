"""
南電錶 — 系統參數與常數
"""

import os as _os

# ============================================================================
# 系統基本參數
# ============================================================================
SYSTEM_PARAMS = {
    "frequency": 60,                      # Hz (台灣電網)
    "main_voltage": 11.4,                 # kV
    "lv_voltage": [0.19, 0.208, 0.22, 0.38],  # kV (110/190, 120/208, 220, 380V)
    "system_mva": 100,                    # MVA base
}

# ============================================================================
# 電纜參數 (XLPE，R/X 取自 VCB 圖標註之 Ω/km)
# ============================================================================
CABLE_PARAMS = {
    38: {
        "r_per_km": 0.5, "x_per_km": 0.07, "rating_a": 97,
        "material": "Copper", "insulation": "XLPE",
    },
    150: {
        "r_per_km": 0.125, "x_per_km": 0.07, "rating_a": 300,
        "material": "Copper", "insulation": "XLPE",
    },
    250: {
        "r_per_km": 0.09, "x_per_km": 0.07, "rating_a": 418,
        "material": "Copper", "insulation": "XLPE",
    },
}

# ============================================================================
# 負載模型參數
# ============================================================================
LOAD_PARAMS = {
    "default_power_factor": 0.9,
    "default_load_model": "ZIP",
    "zip_coefficients": {
        "constant_impedance": 0.3,
        "constant_current": 0.3,
        "constant_power": 0.4,
    },
}

# ============================================================================
# 標準變壓器損耗參考表 (典型值，非銘牌)。單位: kW
# 取得實機銘牌的 no-load / load loss 後，請逐台更新以提升精度。
# ============================================================================
TRANSFORMER_LOSS_TABLE = {
    "油": {  # 油浸式
        200:  {"p0_kw": 0.40, "pk_kw": 2.85},
        250:  {"p0_kw": 0.48, "pk_kw": 3.30},
        300:  {"p0_kw": 0.55, "pk_kw": 3.85},
        400:  {"p0_kw": 0.68, "pk_kw": 4.80},
        500:  {"p0_kw": 0.81, "pk_kw": 5.80},
        600:  {"p0_kw": 0.93, "pk_kw": 6.80},
        750:  {"p0_kw": 1.10, "pk_kw": 8.10},
        1000: {"p0_kw": 1.40, "pk_kw": 10.5},
        1250: {"p0_kw": 1.65, "pk_kw": 12.5},
        1500: {"p0_kw": 1.90, "pk_kw": 14.5},
    },
    "乾": {  # 乾式 (鑄樹脂)
        200:  {"p0_kw": 0.80, "pk_kw": 3.30},
        250:  {"p0_kw": 0.95, "pk_kw": 3.80},
        300:  {"p0_kw": 1.10, "pk_kw": 4.40},
        400:  {"p0_kw": 1.40, "pk_kw": 5.50},
        500:  {"p0_kw": 1.70, "pk_kw": 6.60},
        600:  {"p0_kw": 2.00, "pk_kw": 7.70},
        750:  {"p0_kw": 2.40, "pk_kw": 9.00},
        1000: {"p0_kw": 3.00, "pk_kw": 11.0},
        1250: {"p0_kw": 3.60, "pk_kw": 13.0},
        1500: {"p0_kw": 4.20, "pk_kw": 15.0},
    },
}


def get_transformer_loss(trafo_type, capacity_kva):
    """查標準損耗表，回傳 (空載損 P0_kw, 滿載銅損 Pk_kw)。
    型式預設油式；容量不在表中時取最接近容量按比例估算。"""
    t = "乾" if str(trafo_type).startswith("乾") else "油"
    table = TRANSFORMER_LOSS_TABLE[t]
    if capacity_kva in table:
        e = table[capacity_kva]
        return e["p0_kw"], e["pk_kw"]
    nearest = min(table, key=lambda c: abs(c - capacity_kva))
    scale = capacity_kva / nearest
    return table[nearest]["p0_kw"] * scale, table[nearest]["pk_kw"] * scale


# ============================================================================
# 多情境定義
# ============================================================================
# method:
#   "transformer" — 由 load_data.DEFAULT_BUILDING_LOADS 各台負載建模；
#                   若 load_kw 不為 None，則整體縮放至該系統同時負載 (分散係數)。
# load_kw: 系統同時負載目標 (None = 不縮放，直接用各台負載)
SCENARIOS = {
    "S1": {"period": "基準情境 (各台負載直接代入)", "load_kw": None, "method": "transformer"},
    # S2: 以 EMS MVCB 總盤 (PM_H101 H1一舍B1F總電氣室MVCB盤) 實測為系統同時負載。
    #     值 = 2023/02~09 逐時資料、清理 2 筆異常跳值後之 95 百分位 ≈ 1,653 kW。
    #     模型以分散係數把 load_data 佔位分布縮放至此總量。
    "S2": {"period": "EMS MVCB總盤 95百分位 (2023/02~09)", "load_kw": 1653.0, "method": "transformer"},
}

ACTIVE_SCENARIO = _os.environ.get("BAYESGRID_SCENARIO", "S2").strip()
if ACTIVE_SCENARIO not in SCENARIOS:
    ACTIVE_SCENARIO = "S1"
_sc = SCENARIOS[ACTIVE_SCENARIO]
SYSTEM_COINCIDENT_PEAK_KW = _sc["load_kw"]
SYSTEM_PEAK_PERIOD = _sc["period"]
SYSTEM_LOAD_METHOD = _sc.get("method", "transformer")

# ============================================================================
# 電壓規範 (pu) — 潮流檢查與報告共用
# ============================================================================
VOLTAGE_LIMIT_MIN = 0.95
VOLTAGE_LIMIT_MAX = 1.05

# ============================================================================
# PandaPower 設定
# ============================================================================
PANDAPOWER_CONFIG = {
    "max_iteration": 100,
    "tolerance_mv": 1e-5,
    "tolerance_mvar": 1e-5,
    "algorithm": "nr",          # Newton-Raphson
    "use_numba": False,
    "verbose": True,
    "numba_dict": {},
}
