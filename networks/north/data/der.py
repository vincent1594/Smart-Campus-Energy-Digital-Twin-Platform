"""
微電網分散式電源 (DER):太陽能 / 儲能 / 發電機 —— 依技師用印竣工圖建模。

來源:南臺科技大學-ESS-ALL_(技師用印).pdf 系統單線圖 ESS-2.1(大同智能,竣工 2025-10-31)。
拓撲草稿:docs/SLD/north_X/VCB7.txt (C/D 棟)、VCB2.txt (Z 棟)。

建模方式 (network_builder):
  - 設備直接掛在所屬變壓器的 220V 低壓母線 (lv_bus)。中間的介接變壓器 (200/75/50kVA)
    為用戶端低壓設備,第一版不建成 pandapower 元件,只記在 interface 欄供顯示。
  - pv  → pp.create_sgen,出力 = kWp × SYSTEM_PV_FACTOR
  - ess → pp.create_storage,基準情境待機 (p=0)
  - gen → pp.create_sgen(type="LPG"),基準情境停用 (備用)
  - 微電網所在棟 (MICROGRID_BUILDINGS) 的太陽能改由 sgen 供給:負載加回太陽能出力 (= 實際用電),
    母線淨功率不變。其他棟 (L/M/P) 的太陽能維持於 pv.py 從負載扣除。
"""

SOURCE_DOC = "竣工圖 ESS-2.1 (2025-10-31)"

# 微電網所在棟 (棟別字母,與 area_loads.LOAD_BUILDING 一致)
MICROGRID_BUILDINGS = {"D", "Z"}

# 各站:lv_bus 必須與 network_structure.FEEDERS 中變壓器的 lv_bus 相同
MICROGRID_SITES = [
    {
        "site": "C/D 棟",
        "building": "D",
        "transformer": "TR_CD",
        "lv_bus": "CD_LV_BUS",
        "devices": [
            {"name": "PV_D1", "kind": "pv", "rating_kw": 30, "kwp": 37.62,
             "interface": "TR_PV_CD 75kVA 220V→380V-220V", "note": "逆變器 PV-30000S2-U"},
            {"name": "PV_D2", "kind": "pv", "rating_kw": 30, "kwp": 36.63,
             "interface": "TR_PV_CD 75kVA 220V→380V-220V", "note": "逆變器 PV-30000S2-U"},
            {"name": "PV_D3", "kind": "pv", "rating_kw": 36, "kwp": 23.76,
             "interface": "220V 直接 (MP 盤)", "note": "碩天逆變器 6kW×6,D102"},
            {"name": "BESS_D1", "kind": "ess", "rating_kw": 100, "energy_kwh": 215,
             "interface": "TR_ESS_CD 200kVA 220V→380V", "note": "PCS_D1"},
            {"name": "BESS_D2", "kind": "ess", "rating_kw": 100, "energy_kwh": 215,
             "interface": "TR_ESS_CD 200kVA 220V→380V", "note": "PCS_D2"},
        ],
    },
    {
        "site": "Z 棟 (西淮館)",
        "building": "Z",
        "transformer": "TR_Z_MAIN",
        "lv_bus": "Z_LV_BUS",
        "devices": [
            {"name": "PV_Z", "kind": "pv", "rating_kw": 30, "kwp": 29.4,
             "interface": "TR_MG_Z 50kVA 220V→380V-220V", "note": "逆變器 PV-30000S2-U"},
            {"name": "BESS_Z", "kind": "ess", "rating_kw": 25, "energy_kwh": 105,
             "interface": "TR_MG_Z 50kVA 220V→380V-220V", "note": "PCS_Z"},
            {"name": "GEN_Z", "kind": "gen", "rating_kw": 14,
             "interface": "220V 直接 (3P3W)", "note": "LPG 發電機,瓦斯 20kg×2,備用"},
        ],
    },
]


def pv_device_kw(device: dict, factor: float) -> float:
    """單一太陽能設備出力 = kWp × 日照係數,以逆變器額定封頂。"""
    return min(device["kwp"] * factor, device["rating_kw"])


def microgrid_pv_kw(building: str, factor: float) -> float:
    """某微電網棟的太陽能總出力 (各設備封頂後加總);pv.py 淨扣與 builder sgen 共用,確保兩邊一致。"""
    return sum(pv_device_kw(d, factor) for s in MICROGRID_SITES if s["building"] == building
               for d in s["devices"] if d["kind"] == "pv")


def pv_kwp_by_building() -> dict:
    """微電網各棟太陽能 kWp 合計 (供 pv.py 的 PV_CAPACITY_KW 對照)。"""
    out: dict = {}
    for s in MICROGRID_SITES:
        for d in s["devices"]:
            if d["kind"] == "pv":
                out[s["building"]] = round(out.get(s["building"], 0.0) + d["kwp"], 2)
    return out
