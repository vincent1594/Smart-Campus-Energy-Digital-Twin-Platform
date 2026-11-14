"""
S0 面積法負載分配
------------------
各棟負載 = 樓地板面積 × 用途負載密度,正規化到目標總負載,
再按各台變壓器容量拆分到負載點。pf 沿用各棟運轉值 (load_data)。

資料來源: 112年樓地板面積統計表 (所有權狀面積,已含各樓層總和) —— 原檔 docs/原始資料/112年樓地板面積統計表.pdf。
"""

from .network_structure import FEEDERS

# 樓地板面積 (m²) — 僅含目前模型有的建物
BUILDING_AREA = {
    "A": 2262.91, "B": 4580.30, "C": 1884.45, "D": 1823.40, "F": 2829.24,
    "G": 5029.43, "H3": 5959.39, "J": 4946.15, "K": 10326.62, "L": 9610.70,
    "M": 5887.07, "N": 9268.66, "P": 5702.77, "R": 1655.83, "S": 17282.49,
    "T": 30571.37, "V": 4883.39, "W": 27410.74, "Y": 3769.47, "Z": 399.01,
    "I": 23193.70,
}

# 用途負載密度 (相對 W/m²) — 依 PDF 現用途分類
# 實驗/工程系館 18、生活餐飲 20、教學行政 15、宿舍 12、體育 8、特殊 12
BUILDING_DENSITY = {
    "A": 18, "B": 18, "C": 18, "J": 18, "K": 18, "P": 18, "R": 18, "V": 18, "I": 18,  # 實驗/工程
    "W": 20,                                                                          # 生活餐飲
    "D": 15, "F": 15, "L": 15, "M": 15, "N": 15, "S": 15, "T": 15, "Z": 15,           # 教學行政
    "H3": 12, "G": 12,                                                                # 宿舍 / 社團體育
    "Y": 8,                                                                            # 體育館
}

# 負載點 → 建物
LOAD_BUILDING = {
    "LOAD_N": "N", "LOAD_Y": "Y", "LOAD_F1": "F", "LOAD_F2": "F", "LOAD_F3": "F",
    "LOAD_G1": "G", "LOAD_G2": "G", "LOAD_Z": "Z", "LOAD_M": "M",
    "LOAD_H3_1": "H3", "LOAD_H3_2": "H3",
    "LOAD_K1": "K", "LOAD_K2": "K", "LOAD_K3": "K", "LOAD_K4": "K", "LOAD_K5": "K",
    "LOAD_Q": "R", "LOAD_R": "R", "LOAD_R1": "R", "LOAD_L1": "L", "LOAD_L2": "L",
    "LOAD_P": "P", "LOAD_A": "A", "LOAD_B": "B", "LOAD_T": "T",
    "LOAD_V1": "V", "LOAD_V2": "V", "LOAD_C": "C", "LOAD_D": "D",
    "LOAD_S1": "S", "LOAD_S2": "S", "LOAD_J": "J",
    "LOAD_W1": "W", "LOAD_W2": "W", "LOAD_W3": "W", "LOAD_W4": "W",
    "LOAD_I1": "I", "LOAD_I2": "I", "LOAD_I3": "I", "LOAD_I4": "I",
}


def _load_weights():
    """由 FEEDERS 推各負載點的拆分權重 = 變壓器容量 / 該台負載數。"""
    w = {}
    for vcb, d in FEEDERS.items():
        for sub in d.get("substations", []):
            for tr in sub.get("transformers", []):
                if tr.get("status") == "disabled":
                    continue
                loads = tr.get("loads", [])
                cap = tr.get("capacity", 0) or 0
                for ln in loads:
                    w[ln] = cap / len(loads)
    return w


def compute_area_loads(target_kw):
    """回傳 {load_name: p_kw},總和 = target_kw。"""
    braw = {b: BUILDING_AREA[b] * BUILDING_DENSITY[b] for b in BUILDING_AREA}
    tot = sum(braw.values())
    k0 = target_kw / tot if tot else 0.0
    bload = {b: braw[b] * k0 for b in braw}          # 各棟總負載 kW

    w = _load_weights()
    bw = {}                                          # 各棟權重總和
    for ln, b in LOAD_BUILDING.items():
        bw[b] = bw.get(b, 0.0) + w.get(ln, 0.0)

    out = {}
    for ln, b in LOAD_BUILDING.items():
        share = (w.get(ln, 0.0) / bw[b]) if bw.get(b) else 0.0
        out[ln] = bload.get(b, 0.0) * share
    return out
