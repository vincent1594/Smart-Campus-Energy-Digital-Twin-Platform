"""
頂樓太陽能 (PV) 裝置容量與出力假設
-----------------------------------
資料來源: 頂樓太陽能發電場域建置容量 (修正後容量)。
EMS 量測為「淨台電用電」(已扣 PV),故 EMS 法分配時:
  饋線 gross = EMS淨值 + Σ PV出力;各棟淨台電 = 容量占比×gross − 該棟PV出力。
"""

from .network_structure import FEEDERS
from .area_loads import LOAD_BUILDING

# 各棟 PV 裝置容量 (kW, 修正後)。E/K 為避難空間不施作=0;H1(199.98)模型未含,略。
PV_CAPACITY_KW = {
    "D": 112.86,
    "L": 178.2,
    "M": 121.77,
    "P": 95.04,
    "Z": 29.7,
}
PV_OUTPUT_FACTOR = 0.8   # 預設出力係數 (夏季尖峰);各情境可於 SCENARIOS.pv_factor 覆寫


def pv_output_by_load(factor=PV_OUTPUT_FACTOR):
    """各棟 PV 出力 (容量×factor) 依變壓器容量分到負載點 → {load_name: pv_kw}。"""
    # 反查每棟的負載點與權重 (= 變壓器容量 / 該台負載數)
    bld_loads = {}
    for vcb, d in FEEDERS.items():
        for sub in d.get("substations", []):
            for tr in sub.get("transformers", []):
                if tr.get("status") == "disabled":
                    continue
                cap = tr.get("capacity", 0) or 0
                lst = tr.get("loads", [])
                for ln in lst:
                    b = LOAD_BUILDING.get(ln)
                    if b:
                        bld_loads.setdefault(b, []).append((ln, cap / len(lst) if lst else 0))
    out = {}
    for b, cap_kw in PV_CAPACITY_KW.items():
        pv = cap_kw * factor
        lst = bld_loads.get(b, [])
        totw = sum(w for _, w in lst)
        for ln, w in lst:
            out[ln] = out.get(ln, 0.0) + (pv * w / totw if totw else 0.0)
    return out
