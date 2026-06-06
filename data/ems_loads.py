"""
EMS 實測負載分配 (S0)
---------------------
直接採用 EMS 各 VCB 饋線「實測逐時功率」,按各台變壓器容量分配到負載點。
實測值本為系統同時值,無須分散係數。pf 沿用各棟運轉值 (load_data)。

資料來源: EMS/11205-06(北).xls  (2023/05-06 逐時, HTML 格式)
EMS 饋線欄 VCB1~VCB12 直接對應模型 FEEDERS 同名饋線。
"""

import glob
import pandas as pd
from pathlib import Path
from .network_structure import FEEDERS

# EMS 檔 (11205-06 北):以 glob 定位,對副檔名 (.xls / .xlsx) 變動免疫
_EMS_DIR = Path(__file__).resolve().parent.parent / "EMS"
_cands = sorted(glob.glob(str(_EMS_DIR / "11205*")))
EMS_FILE = Path(_cands[0]) if _cands else (_EMS_DIR / "11205-06(北).xlsx")
DEFAULT_TIMESTAMP = "2023-06-08 14:00"   # 全期系統尖峰
_COLS = ["dt", "總", "VCB1", "VCB2", "VCB3", "VCB4", "VCB5", "VCB6",
         "VCB7", "VCB8", "VCB9", "VCB10", "VCB11", "VCB12"]


def _read_ems():
    f = str(EMS_FILE)
    try:
        t = pd.read_excel(f, sheet_name=0, header=None)   # 真 .xlsx
    except Exception:
        t = pd.read_html(f)[0]                            # 舊版 HTML 偽 .xls 後備
    t.columns = _COLS
    t = t.drop(0).reset_index(drop=True)
    t["dt"] = pd.to_datetime(t["dt"])
    for c in _COLS[1:]:
        t[c] = pd.to_numeric(t[c], errors="coerce")
    return t.dropna(subset=["dt"])


def get_feeder_kw(timestamp=DEFAULT_TIMESTAMP):
    """回傳該時刻各饋線實測 kW {VCBx: kw}。"""
    t = _read_ems()
    row = t[t["dt"] == pd.Timestamp(timestamp)]
    if row.empty:
        raise ValueError(f"EMS 無此時刻: {timestamp}")
    row = row.iloc[0]
    return {f"VCB{i}": float(row[f"VCB{i}"]) for i in range(1, 13)}


# ── VCB3 (K.L.Q.R) 實測校正 ──────────────────────────────────────────
# 來源: L,Q,R用電.xlsx (2023/5 平日 08-18 平均) + 11205-06 VCB3 餘額 → K機械。
# 以「各棟實測 kW」取代容量法,作為 VCB3 內部分配權重(其餘饋線仍用容量)。
_CALIB_VCB3_BLD_KW = {"K": 191.3, "L": 114.3, "Qg": 42.1, "Rc": 16.6}
_CALIB_VCB3_LOAD_BLD = {
    "LOAD_K1": "K", "LOAD_K2": "K", "LOAD_K3": "K", "LOAD_K4": "K", "LOAD_K5": "K",
    "LOAD_L1": "L", "LOAD_L2": "L", "LOAD_Q": "Qg", "LOAD_R": "Rc", "LOAD_R1": "Rc",
}


def _calib_weights():
    """VCB3 校正權重 {load: weight} = 各棟實測 × 棟內容量占比。"""
    capw = {}
    for vcb, d in FEEDERS.items():
        for sub in d.get("substations", []):
            for tr in sub.get("transformers", []):
                if tr.get("status") == "disabled":
                    continue
                cap = tr.get("capacity", 0) or 0
                lst = tr.get("loads", [])
                for ln in lst:
                    capw[ln] = cap / len(lst) if lst else 0
    grp = {}
    for ln, b in _CALIB_VCB3_LOAD_BLD.items():
        grp[b] = grp.get(b, 0.0) + capw.get(ln, 0.0)
    out = {}
    for ln, b in _CALIB_VCB3_LOAD_BLD.items():
        gc = grp.get(b, 0.0)
        out[ln] = _CALIB_VCB3_BLD_KW[b] * (capw.get(ln, 0.0) / gc) if gc else 0.0
    return out


def _distribute(feeder_kw, pv_by_load=None, calib_weights=None):
    """將各饋線淨值 {VCBx: kw} 分到負載點 → {load_name: 淨台電 kw}。
    權重: calib_weights 有提供者用實測校正權重,否則用變壓器容量。
    pv_by_load 提供時:還原 gross = 饋線淨值 + Σ該饋線PV出力,按權重拆 gross,
    再扣各棟 PV → 各棟淨台電(PV 建築變小)。EMS 為淨值故須如此還原。"""
    pv_by_load = pv_by_load or {}
    calib_weights = calib_weights or {}
    out = {}
    for vcb, d in FEEDERS.items():
        if "shunt_feeder" in d:        # VCB12 純電容,無負載
            continue
        loads = []                     # (load_name, 權重)
        for sub in d.get("substations", []):
            for tr in sub.get("transformers", []):
                if tr.get("status") == "disabled":
                    continue
                cap = tr.get("capacity", 0) or 0
                lst = tr.get("loads", [])
                for ln in lst:
                    w = calib_weights.get(ln, cap / len(lst) if lst else 0)
                    loads.append((ln, w))
        totw = sum(w for _, w in loads)
        pv_feeder = sum(pv_by_load.get(ln, 0.0) for ln, _ in loads)
        feeder_gross = feeder_kw.get(vcb, 0.0) + pv_feeder      # 還原 gross
        for ln, w in loads:
            gross_i = feeder_gross * w / totw if totw else 0.0
            out[ln] = gross_i - pv_by_load.get(ln, 0.0)         # 淨台電 = gross − PV
    return out


def compute_ems_loads(timestamp=DEFAULT_TIMESTAMP, pv_factor=0.8):
    """S0 實測法: 取某時刻各饋線實測值,按權重分到負載點 (VCB3 用實測校正,考慮 PV)。"""
    from .pv import pv_output_by_load
    return _distribute(get_feeder_kw(timestamp), pv_output_by_load(pv_factor), _calib_weights())


def feeder_weekday_shares(hour_lo=8, hour_hi=18):
    """平日(一~五)日間各饋線平均占比 {VCBx: share},Σ=1。"""
    t = _read_ems()
    t = t[(t["dt"].dt.dayofweek <= 4) & (t["dt"].dt.hour >= hour_lo) & (t["dt"].dt.hour <= hour_hi)]
    fc = [f"VCB{i}" for i in range(1, 12)]   # VCB12=電容,排除
    avg = {c: t[c].mean() for c in fc}
    s = sum(avg.values())
    return {c: (avg[c] / s if s else 0.0) for c in fc}


def compute_ems_profile_loads(total_kw, hour_lo=8, hour_hi=18, pv_factor=0.8):
    """以平日日間平均饋線占比 × 總量,再按容量分到負載點 (考慮 PV 建築)。"""
    from .pv import pv_output_by_load
    shares = feeder_weekday_shares(hour_lo, hour_hi)
    feeder_kw = {c: total_kw * sh for c, sh in shares.items()}
    return _distribute(feeder_kw, pv_output_by_load(pv_factor), _calib_weights())
