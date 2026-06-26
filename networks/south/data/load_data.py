"""
南電錶 — 各變壓器負載資料 (實測校正版)

資料來源: 論文實驗X電錶/data/各站變壓器規格容量資料.xlsx (各站變壓器系統資料)
          逐台「平均負載 (kW)」與「功因」實測運轉值。比照北電錶建模做法。

慣例 (比照北電錶):
  • p_kw — 實測平均有功負載 (kW)。
  • pf   — 實測「補償後」功率因數 (已含併聯電容修正)。各 LV 母線實裝電容已折入此 pf,
           故 network_structure 的 capacitors rating 皆設 0 (不另建顯式 shunt),避免重複補償。
           唯 VCB5 CB_BUS 為獨立電容補償饋線 (非折入單一負載),仍顯式建模。
  建模時無功 Q = p_kw × tan(arccos(pf))。括號內為對應 excel 變壓器編號。
"""

DEFAULT_BUILDING_LOADS = {
    # VCB1 — H1_BUS (H1 第一宿舍 / H2 宿舍區)
    "LOAD_H2":   {"p_kw": 106.7, "pf": 1.00},  # TR_H2   300kVA  (TR-28)
    "LOAD_H1_2": {"p_kw": 90.5,  "pf": 0.95},  # TR_H1_2 1000kVA (TR-43)
    "LOAD_H1_3": {"p_kw": 93.7,  "pf": 1.00},  # TR_H1_3 400kVA  (TR-27)

    # VCB2 — H6_BUS (H6 第六宿舍)
    "LOAD_H6_1": {"p_kw": 358.4, "pf": 0.99},  # TR_H6_1 1000kVA (TR-31)
    "LOAD_H6_2": {"p_kw": 193.5, "pf": 0.98},  # TR_H6_2 750kVA  (TR-32)
    "LOAD_H6_3": {"p_kw": 225.7, "pf": 0.98},  # TR_H6_3 1000kVA (TR-33)
    "LOAD_H6_4": {"p_kw": 260.6, "pf": 0.99},  # TR_H6_4 1000kVA (TR-34)

    # VCB3 — E_BUS (E 圖書資訊館;TR_E_1~4 為 E 自身,TR_E_5 750kVA 供污水廠 SP)
    "LOAD_E_1": {"p_kw": 264.6, "pf": 1.00},   # TR_E_1 1000kVA (TR-4)
    "LOAD_E_2": {"p_kw": 226.4, "pf": 1.00},   # TR_E_2 1000kVA (TR-5)
    "LOAD_E_3": {"p_kw": 296.2, "pf": 1.00},   # TR_E_3 1000kVA (TR-6)
    "LOAD_E_4": {"p_kw": 187.6, "pf": 1.00},   # TR_E_4 1000kVA (TR-7)
    # 污水廠 SP = E 第 5 台 (750kVA, TR-8) 的負載;實裝 240kVAr 電容折入補償後 pf
    "LOAD_SP":  {"p_kw": 142.9, "pf": 1.00},   # TR_E_5 750kVA@110V (TR-8)

    # VCB4 — U_BUS (U 優活館)
    "LOAD_U_1": {"p_kw": 230.4, "pf": 1.00},   # TR_U_1 400kVA (TR-42)

    # VCB6 — O_BUS (O 高齡福祉館)
    "LOAD_O":   {"p_kw": 60.5,  "pf": 0.98},   # TR_O 300kVA (TR-52)
}
