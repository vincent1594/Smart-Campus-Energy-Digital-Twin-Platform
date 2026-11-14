"""
System Parameters and Constants for Campus Distribution Network
"""

import logging

# ============================================================================
# 系統基本參數
# ============================================================================

SYSTEM_PARAMS = {
    "frequency": 60,              # Hz (台灣電網)
    "main_voltage": 11.4,         # kV
    "lv_voltage": [0.22, 0.38],   # kV (220V, 380V)
    "system_mva": 100,            # MVA base
}

# ============================================================================
# 電纜參數 (XLPE絕緣，0.6/1kV)
# ============================================================================

CABLE_PARAMS = {
    # 格式: cross_section_mm² -> {"R": Ω/km, "X": Ω/km, "rating_A": max current}
    38: {
        "r_per_km": 0.5,
        "x_per_km": 0.07,
        "rating_a": 97,
        "material": "Copper",
        "insulation": "XLPE"
    },
    60: {
        "r_per_km": 0.32,
        "x_per_km": 0.07,
        "rating_a": 143,
        "material": "Copper",
        "insulation": "XLPE"
    },
    250: {
        "r_per_km": 0.09,
        "x_per_km": 0.07,
        "rating_a": 418,
        "material": "Copper",
        "insulation": "XLPE"
    }
}

# ============================================================================
# 變壓器參數
# ============================================================================

TRANSFORMER_PARAMS = {
    # 格式: capacity_kva -> {"Zk": impedance %, "Pk": Cu loss W, "i0": no-load current %}
    200: {"zk": 4.5, "pk": 1400, "i0": 2.5},
    250: {"zk": 4.5, "pk": 1600, "i0": 2.5},
    300: {"zk": 4.5, "pk": 1900, "i0": 2.5},
    400: {"zk": 4.5, "pk": 2300, "i0": 2.5},
    500: {"zk": 4.5, "pk": 2800, "i0": 2.5},
    600: {"zk": 4.5, "pk": 3200, "i0": 2.5},
    750: {"zk": 6.0, "pk": 3900, "i0": 2.5},
    1250: {"zk": 6.0, "pk": 5600, "i0": 2.5},
    1500: {"zk": 6.0, "pk": 6400, "i0": 2.5},
}

# ============================================================================
# 負載模型參數
# ============================================================================

LOAD_PARAMS = {
    "default_power_factor": 0.9,          # 預設功率因數 (cos φ)
    "default_load_model": "ZIP",           # ZIP model: P = P0(U/U0)^a, Q = Q0(U/U0)^b
    "zip_coefficients": {
        # P = const_Z * U^2 + const_I * U + const_P
        "constant_impedance": 0.3,
        "constant_current": 0.3,
        "constant_power": 0.4,
    }
}

# ============================================================================
# 標準變壓器損耗參考表 (典型值，非銘牌)
# ============================================================================
# 依「型式 (油式/乾式)」與「容量 kVA」查空載損 P0(鐵損,恆定) 與滿載銅損 Pk。
# 數值為配電變壓器典型參考值 (P0~0.15-0.4% 容量, Pk~1-1.4% 容量)，
# 取代舊的「鐵損=1%、銅損=2% 容量」過高假設。
# ★ 取得實機銘牌的 no-load/load loss 後，請逐台更新以提升精度。
# 單位: kW
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
    "乾": {  # 乾式 (鑄樹脂)，空載損通常較油式高
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
# 系統尖峰與分散係數
# ============================================================================
# 各變壓器「平均負載」為非同時值，直接加總會超過系統實測同時負載。
# 建模時保留真實分布比例，整體縮放到此系統同時負載目標。
#
# 多情境定義: key = 情境代號, period = 期間/情境名, load_kw = 系統同時負載 (None=不縮放)
SCENARIOS = {
    # method: "transformer"(變壓器平均負載比例,預設)、"area"(樓地板面積×用途密度)、"ems"(EMS實測各饋線)
    "S0":   {"period": "EMS實測尖峰日 2023/06/08 14:00", "load_kw": None, "method": "ems",
             "timestamp": "2023-06-08 14:00", "pv_factor": 0.0},     # 全期實測尖峰(用實測淨值,平台基準)
    "S1":   {"period": "2023/03/01 半尖峰", "load_kw": 1860.0, "method": "xgboost_profile",
             "timestamp": "2023-03-01 14:00", "pv_factor": 0.4},      # 3月冬陽,較低
    "S1.1": {"period": "2026年6月8號 14:00", "load_kw": 3400.0, "method": "xgboost_profile",
             "timestamp": "2026-06-08 14:00", "pv_factor": 0.75},     # 夏季午後,日照強
    "S1.2": {"period": "2026年6月8號 09:00", "load_kw": 2470.0, "method": "xgboost_profile",
             "timestamp": "2026-06-08 09:00", "pv_factor": 0.5},      # 夏季上午,日照中等
    "S2":   {"period": "XGBoost預測 2026/06/08 14:00", "load_kw": None, "method": "xgboost",
             "timestamp": "2026-06-08 14:00", "pv_factor": 0.8},      # ML 預測各饋線(5月訓練)
}
# 執行時以環境變數 BAYESGRID_SCENARIO 選擇 (預設 S0=歷史實測尖峰日,平台基準);論文報告程式 run_s1_baseline.py(已移至論文素材)可由命令列帶入
import os as _os
ACTIVE_SCENARIO = _os.environ.get("BAYESGRID_SCENARIO", "S0").strip()
if ACTIVE_SCENARIO not in SCENARIOS:
    ACTIVE_SCENARIO = "S0"
_sc = SCENARIOS[ACTIVE_SCENARIO]
SYSTEM_COINCIDENT_PEAK_KW = _sc["load_kw"]
SYSTEM_PEAK_PERIOD = _sc["period"]
SYSTEM_LOAD_METHOD = _sc.get("method", "transformer")  # transformer / area / ems
SYSTEM_LOAD_TIMESTAMP = _sc.get("timestamp")           # ems 法用的實測時刻
SYSTEM_PV_FACTOR = _sc.get("pv_factor", 0.8)           # PV 出力係數 (容量×此值)

# ============================================================================
# PandaPower相關設定
# ============================================================================

PANDAPOWER_CONFIG = {
    "max_iteration": 100,
    "tolerance_mv": 1e-5,           # Tolerance for power flow in MW
    "tolerance_mvar": 1e-5,         # Tolerance for power flow in MVAr
    "algorithm": "nr",              # Newton-Raphson
    "use_numba": False,
    "verbose": True,
    "numba_dict": {},
}


# 電壓規範 (pu) — 集中管理，潮流檢查與報告共用
VOLTAGE_LIMIT_MIN = 0.95
VOLTAGE_LIMIT_MAX = 1.05

