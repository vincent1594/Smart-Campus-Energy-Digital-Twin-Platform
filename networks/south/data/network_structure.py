"""
南電錶 — 校園 11.4kV 配電系統 (南半部) 網路拓樸定義
資料來源: VCB1~VCB6 單線圖 + 各站變壓器規格容量資料.xlsx (實測校正)

南電錶涵蓋之建物正是北電錶 (論文實驗X電錶) 報告中「模型未含」者:
  E 圖書資訊館、H1 第一宿舍、H6 第六宿舍、U 優活館、O 高齡福祉館、SP 污水處理廠

校正 (比照北電錶):
  • 變壓器容量「以單線圖為準」(excel 規格表有些有誤);型式/電壓取自規格表。
    O 高齡福祉 = 400kVA (單線圖;excel TR-52 誤標 300)。
  • SP 污水處理廠 = E 第 5 台 (TR_E_5 750kVA@110V) 底下的「一個負載點」(LOAD_SP),
    不另設獨立變壓器 (依使用者指定,與其他負載一樣是 load 葉節點)。
  • 電容: 各 LV 母線實裝電容「折入補償後 pf」(見 load_data.py),故下方 capacitors rating 皆設 0
    (builder 在 rating>0 才建 shunt),括號註記實裝 kVAr。唯 VCB5 CB_BUS 為獨立電容饋線仍顯式建模。
"""

# ============================================================================
# 主網路: 台電進線 → 校內 CU_BUS (銅母線, 各 VCB 由此分出)
# ============================================================================
MAIN_NETWORK = {
    "name": "Campus 11.4kV Distribution (South)",
    "source": {
        "name": "TPC_11.4kV",
        "voltage": 11.4,
        "frequency": 60,
    },
    "main_cable": {
        "conductor": "XLPE",
        "cross_section": 250,  # mm²
        "quantity": 3,
        "resistance": 0.09,    # Ω/km
        "reactance": 0.07,     # Ω/km
        "length": 100,         # m — 台電端實際長度未知，此為計算用假設值
        "length_unknown": True,
    }
}

# ============================================================================
# 6 個 VCB 饋線定義 (CU_BUS = 共同受電母線)
# 每條 substations[*] 由 CU_BUS 經電纜接至饋線母線，其下掛變壓器。
# 變壓器 voltage_lv 採各 LV 母線實際標稱電壓 (kV)。
# capacitors[*].rating = 0 表示實裝電容已折入 load_data 的補償後 pf,不另建顯式 shunt。
# ============================================================================
FEEDERS = {
    "VCB1": {
        "name": "VCB1 - H1_BUS",
        "bus_id": "CU_BUS",
        # CU_BUS → H1_BUS: 38mm²×3，長度未知
        "cable_to_bus": {"cross_section": 38, "length": 100, "length_unknown": True},
        "substations": [
            {
                "bus": "H1_BUS",
                "transformers": [
                    {
                        "name": "TR_H2", "capacity": 300,
                        "voltage_hv": 11.4, "voltage_lv": 0.22,
                        "lv_bus": "H2_LV_BUS",
                        "loads": ["LOAD_H2"],
                        "capacitors": [{"name": "CAP_H2", "rating": 0}],  # 實裝 60kVAr,折入 pf
                        # 註: TR_H2 與 H2_LV_BUS 間另有 100m×1.2 低壓電纜 (線徑未標)，
                        # 本模型比照北電錶慣例不建 LV 電纜，僅記錄供參。
                        "lv_cable_note": "100m×1.2 LV 電纜 (線徑未標)",
                    },
                    {
                        "name": "TR_H1_2", "capacity": 1000,
                        "voltage_hv": 11.4, "voltage_lv": 0.22,
                        "lv_bus": "H1_2_LV_BUS",
                        "loads": ["LOAD_H1_2"],
                        "capacitors": [{"name": "CAP_H1_2", "rating": 0}],  # 實裝 120kVAr,折入 pf
                    },
                    {
                        "name": "TR_H1_3", "capacity": 400,
                        "voltage_hv": 11.4, "voltage_lv": 0.208,  # 208V/120V
                        "lv_bus": "H1_3_LV_BUS",
                        "loads": ["LOAD_H1_3"],
                        "capacitors": [{"name": "CAP_H1_3", "rating": 0}],  # 實裝 80kVAr,折入 pf
                    },
                ],
            },
        ],
    },

    "VCB2": {
        "name": "VCB2 - H6_BUS",
        "bus_id": "CU_BUS",
        # CU_BUS → H6_BUS: 150mm²×3，193m×1.2
        "cable_to_bus": {"cross_section": 150, "length": 193 * 1.2},
        "substations": [
            {
                "bus": "H6_BUS",
                "transformers": [
                    {"name": "TR_H6_1", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "H6_1_LV_BUS", "loads": ["LOAD_H6_1"],
                     "capacitors": [{"name": "CAP_H6_1", "rating": 0}]},  # 實裝 480kVAr,折入 pf
                    {"name": "TR_H6_2", "capacity": 750, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "H6_2_LV_BUS", "loads": ["LOAD_H6_2"],
                     "capacitors": [{"name": "CAP_H6_2", "rating": 0}]},  # 實裝 480kVAr,折入 pf
                    {"name": "TR_H6_3", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "H6_3_LV_BUS", "loads": ["LOAD_H6_3"],
                     "capacitors": [{"name": "CAP_H6_3", "rating": 0}]},  # 實裝 480kVAr,折入 pf
                    {"name": "TR_H6_4", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "H6_4_LV_BUS", "loads": ["LOAD_H6_4"],
                     "capacitors": [{"name": "CAP_H6_4", "rating": 0}]},  # 實裝 480kVAr,折入 pf
                ],
            },
        ],
    },

    "VCB3": {
        "name": "VCB3 - E_BUS",
        "bus_id": "CU_BUS",
        # CU_BUS → E_BUS: 150mm²×3，273m×1.2
        "cable_to_bus": {"cross_section": 150, "length": 273 * 1.2},
        "substations": [
            {
                "bus": "E_BUS",
                "transformers": [
                    {"name": "TR_E_1", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "E_1_LV_BUS", "loads": ["LOAD_E_1"],
                     "capacitors": [{"name": "CAP_E_1", "rating": 0}]},  # 實裝 360kVAr,折入 pf
                    {"name": "TR_E_2", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "E_2_LV_BUS", "loads": ["LOAD_E_2"],
                     "capacitors": [{"name": "CAP_E_2", "rating": 0}]},  # 實裝 360kVAr,折入 pf
                    {"name": "TR_E_3", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "E_3_LV_BUS", "loads": ["LOAD_E_3"],
                     "capacitors": [{"name": "CAP_E_3", "rating": 0}]},  # 實裝 360kVAr,折入 pf
                    {"name": "TR_E_4", "capacity": 1000, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "E_4_LV_BUS", "loads": ["LOAD_E_4"],
                     "capacitors": [{"name": "CAP_E_4", "rating": 0}]},  # 實裝 360kVAr,折入 pf
                    # E 第 5 台 (750kVA@110V) 供污水廠 SP — SP 為此台底下「一個負載點」(LOAD_SP)
                    # (依使用者指定:SP 不另設獨立變壓器,與其他負載一樣是掛在變壓器底下的 load 葉節點)
                    {"name": "TR_E_5", "capacity": 750, "voltage_hv": 11.4, "voltage_lv": 0.11,  # 110V
                     "lv_bus": "E_5_LV_BUS", "loads": ["LOAD_SP"],
                     "capacitors": [{"name": "CAP_E_5", "rating": 0}]},  # 實裝 240kVAr,折入 pf
                ],
            },
        ],
    },

    "VCB4": {
        "name": "VCB4 - U_BUS",
        "bus_id": "CU_BUS",
        # CU_BUS → U_BUS: 38mm²×3，212m×1.2
        "cable_to_bus": {"cross_section": 38, "length": 212 * 1.2},
        "substations": [
            {
                "bus": "U_BUS",
                "transformers": [
                    {"name": "TR_U_1", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "U_1_LV_BUS", "loads": ["LOAD_U_1"],
                     "capacitors": [{"name": "CAP_U_1", "rating": 0}]},  # 實裝 100kVAr,折入 pf
                ],
            },
        ],
    },

    "VCB5": {
        "name": "VCB5 - 電容補償饋線",
        "bus_id": "CU_BUS",
        # 純電容補償饋線: CU_BUS →(直接耦合)→ CB_BUS → 並聯電容 CAP_CB
        # 原圖無進線電纜長度/線徑，CB_BUS 直接由 CU_BUS 供電 (以閉合母線開關耦合)。
        # 此為獨立電容補償 (非折入單一負載),仍顯式建模。
        "shunt_feeder": {
            "bus": "CB_BUS",
            "bus_vn_kv": 11.4,   # 電氣電壓 (與系統同;11.95 為電容額定)
            "capacitor": {"name": "CAP_CB", "rating": 200, "rated_kv": 11.95},
        },
    },

    "VCB6": {
        "name": "VCB6 - O_BUS",
        "bus_id": "CU_BUS",
        # CU_BUS → O_BUS: 38mm²×3，172m×1.2
        "cable_to_bus": {"cross_section": 38, "length": 172 * 1.2},
        "substations": [
            {
                "bus": "O_BUS",
                "transformers": [
                    # O 高齡福祉 = 400kVA (單線圖為準;excel TR-52 誤標 300)
                    {"name": "TR_O", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.38,
                     "lv_bus": "O_LV_BUS", "loads": ["LOAD_O"],
                     "capacitors": [{"name": "CAP_O", "rating": 0}]},  # 實裝 160kVAr,折入 pf
                ],
            },
        ],
    },
}

# ============================================================================
# 電纜參數 (依 VCB 圖標註之 Ω/km)
# ============================================================================
CABLE_PARAMETERS = {
    38:  {"resistance": 0.5,   "reactance": 0.07},
    150: {"resistance": 0.125, "reactance": 0.07},
    250: {"resistance": 0.09,  "reactance": 0.07},
}

# ============================================================================
# 變壓器標準短路阻抗 (Z%) — 容量 → 小數
# ============================================================================
TRANSFORMER_IMPEDANCE = {
    300:  0.045,
    400:  0.045,
    750:  0.060,
    1000: 0.060,
}
