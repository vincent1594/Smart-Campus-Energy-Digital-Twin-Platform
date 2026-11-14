"""
Campus 11.4kV Distribution Network Structure Definition
從整合.txt解析的網路拓撲結構
"""

# 主網路參數
MAIN_NETWORK = {
    "name": "Campus 11.4kV Distribution",
    "source": {
        "name": "TPC_11.4kV",
        "voltage": 11.4,
        "frequency": 60,
    },
    "main_cable": {
        "conductor": "XLPE",
        "cross_section": 250,  # mm²
        "quantity": 3,
        "resistance": 0.09,  # Ω/km
        "reactance": 0.07,   # Ω/km
        "length": 100,         # m — 台電端實際長度未知，此為計算用假設值
        "length_unknown": True,
    }
}

# 12個VCB Feeder定義
FEEDERS = {
    "VCB1": {
        "name": "VCB1 · N Y F G1",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "N_BUS",
                "cable": {"cross_section": 60, "length": 374.4},  # mm², m
                "transformers": [
                    {
                        "name": "TR_N_MAIN",
                        "capacity": 400,  # kVA
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.38,
                        "lv_bus": "N_LV_BUS",
                        "loads": ["LOAD_N"],
                        "capacitors": [{"name": "CAP_N", "rating": 0}],  # 折入 TR-23 運轉功因(實裝50)
                    }
                ]
            },
            {
                "bus": "Y_BUS",
                "cable": {"cross_section": 60, "length": 49.8},
                "transformers": [
                    {
                        "name": "TR_Y_MAIN",
                        "capacity": 500,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.22,
                        "lv_bus": "Y_LV_BUS",
                        "loads": ["LOAD_Y"],
                    }
                ]
            },
            {
                "bus": "F_BUS",
                "cable": {"cross_section": 60, "length": 114.0},
                "transformers": [
                    {"name": "TR_F_250", "capacity": 250, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "F1_LV_BUS", "loads": ["LOAD_F1"]},
                    {"name": "TR_F_500", "capacity": 500, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "F2_LV_BUS", "loads": ["LOAD_F2"]},
                    {"name": "TR_F_400", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "F3_LV_BUS", "loads": ["LOAD_F3"]},
                ]
            },
            {
                "bus": "G1_BUS",
                "cable": {"cross_section": 60, "length": 93.6},
                "transformers": [
                    {
                        "name": "TR_G1_MAIN",
                        "capacity": 400,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.22,
                        "lv_bus": "G1_LV_BUS",
                        "loads": ["LOAD_G1"],
                    }
                ]
            }
        ]
    },

    "VCB2": {
        "name": "VCB2 · Z M G2 H3",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "Z_BUS",
                "cable": {"cross_section": 60, "length": 192},
                "transformers": [
                    {"name": "TR_Z_MAIN", "capacity": 200, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "Z_LV_BUS", "loads": ["LOAD_Z"]}
                ]
            },
            {
                "bus": "M_BUS",
                "cable": {"cross_section": 60, "length": 141.6},
                "transformers": [
                    {
                        "name": "TR_M_MAIN",
                        "capacity": 750,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.38,
                        "lv_bus": "M_LV_BUS",
                        "loads": ["LOAD_M"],
                        "capacitors": [{"name": "CAP_M", "rating": 0}],  # 折入 TR-26 運轉功因(實裝120)
                    }
                ]
            },
            {
                "bus": "G2_BUS",
                "cable": {"cross_section": 60, "length": 198},
                "transformers": [
                    {"name": "TR_G2_MAIN", "capacity": 300, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "G2_LV_BUS", "loads": ["LOAD_G2"]}
                ]
            },
            {
                "bus": "H3_BUS",
                "cable": {"cross_section": 60, "length": 187.2},
                "transformers": [
                    {"name": "TR_H3_1", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "H3_1_LV_BUS", "loads": ["LOAD_H3_1"]},
                    {"name": "TR_H3_2", "capacity": 300, "voltage_hv": 11.4, "voltage_lv": 0.19, "lv_bus": "H3_2_LV_BUS", "loads": ["LOAD_H3_2"]},
                ]
            }
        ]
    },

    "VCB3": {
        "name": "VCB3 · K R L",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "K_BUS",
                "cable": {"cross_section": 60, "length": 174.4 * 1.2},
                "transformers": [
                    {"name": "TR_K_1", "capacity": 300, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "K1_LV_BUS", "loads": ["LOAD_K1"]},
                    {"name": "TR_K_2", "capacity": 300, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "K2_LV_BUS", "loads": ["LOAD_K2"]},
                    {"name": "TR_K_3", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "K3_LV_BUS", "loads": ["LOAD_K3"]},
                    {"name": "TR_K_4", "capacity": 500, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "K4_LV_BUS", "loads": ["LOAD_K4"]},
                    {"name": "TR_K_5", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "K5_LV_BUS", "loads": ["LOAD_K5"]},
                ]
            },
            {
                # R汽車工程館: 並聯在 K_BUS 下游，經 109.2m 電纜接出
                "bus": "R_BUS",
                "parent_bus": "K_BUS",
                "cable": {"cross_section": 60, "length": 91 * 1.2},
                "transformers": [
                    {
                        "name": "TR_K_6",
                        "capacity": 600,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.22,
                        "lv_bus": "R_LV_BUS",
                        "loads": ["LOAD_Q", "LOAD_R", "LOAD_R1"],
                        "capacitors": [{"name": "CAP_K", "rating": 150}],  # R_LV_BUS 並聯電容 150kVAr
                    }
                ]
            },
            {
                "bus": "L_BUS",
                "cable": {"cross_section": 60, "length": 67 * 1.2},
                "transformers": [
                    {
                        "name": "TR_L_1",
                        "capacity": 300,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.208,
                        "lv_bus": "L1_LV_BUS",
                        "loads": ["LOAD_L1"],
                        "capacitors": [{"name": "CAP_L", "rating": 0}],
                    },
                    {"name": "TR_L_2", "capacity": 400, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "L2_LV_BUS", "loads": ["LOAD_L2"]},
                ]
            }
        ]
    },

    "VCB4": {
        "name": "VCB4 · P",
        "bus_id": "CU_BUS",
        "cable_to_bus": {"cross_section": 38, "length": 53 * 1.2, "resistance": 0.5, "reactance": 0.07},
        "substations": [
            {
                "bus": "P_BUS",
                "transformers": [
                    {
                        "name": "TR_P",
                        "capacity": 400,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.22,
                        "lv_bus": "P_LV_BUS",
                        "loads": ["LOAD_P"],
                        "capacitors": [{"name": "CAP_P", "rating": 0}],  # 折入 TR-13 運轉功因(實裝125)
                    }
                ]
            }
        ]
    },

    "VCB5": {
        "name": "VCB5 · A B",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "A_BUS",
                "cable": {"cross_section": 60, "length": 103 * 1.2},
                "transformers": [
                    {"name": "TR_A_MAIN", "capacity": 200, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "A_LV_BUS", "loads": ["LOAD_A"]}
                ]
            },
            {
                "bus": "B_BUS",
                "cable": {"cross_section": 60, "length": 35 * 1.2},
                "transformers": [
                    {"name": "TR_B_MAIN", "capacity": 500, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "B_LV_BUS", "loads": ["LOAD_B"]}
                ]
            }
        ]
    },

    "VCB6": {
        "name": "VCB6 · T V",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "T_BUS",
                "cable": {"cross_section": 60, "length": 373 * 1.2},
                "transformers": [
                    {
                        "name": "TR_T_1",
                        "capacity": 1250,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.38,
                        "lv_bus": "T_LV_BUS",
                        "type": "乾",
                        "loads": ["LOAD_T"],
                        "capacitors": [{"name": "CAP_T", "rating": 0}],  # 折入 TR-37 運轉功因(實裝340)
                    },
                    {"name": "TR_T_2", "capacity": 1250, "type": "乾", "status": "disabled", "reason": "停用"},
                    {"name": "TR_T_3", "capacity": 1500, "type": "乾", "status": "disabled", "reason": "停用"},
                ]
            },
            {
                "bus": "V_BUS",
                "cable": {"cross_section": 38, "length": 112 * 1.2},
                "transformers": [
                    {"name": "TR_V_1", "capacity": 600, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "V1_LV_BUS", "loads": ["LOAD_V1"]},
                    {"name": "TR_V_2", "capacity": 750, "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "V2_LV_BUS", "loads": ["LOAD_V2"]},
                ]
            }
        ]
    },

    "VCB7": {
        "name": "VCB7 · C D",
        "bus_id": "CU_BUS",
        "cable_to_bus": {"cross_section": 38, "length": 114 * 1.2, "resistance": 0.5, "reactance": 0.07},
        "substations": [
            {
                "bus": "CD_BUS",
                "transformers": [
                    {"name": "TR_CD", "capacity": 300, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "CD_LV_BUS", "loads": ["LOAD_C", "LOAD_D"]}
                ]
            }
        ]
    },

    "VCB8": {
        "name": "VCB8 · S",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "S_BUS",
                "cable": {"cross_section": 60, "length": 85 * 1.2},
                "transformers": [
                    {
                        "name": "TR_S1",
                        "capacity": 750,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.38,
                        "lv_bus": "S1_LV_BUS",
                        "loads": ["LOAD_S1"],
                        "capacitors": [{"name": "CAP_S1", "rating": 0}],  # 折入 TR-16 運轉功因(實裝225)
                    },
                    {
                        "name": "TR_S2",
                        "capacity": 400,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.11,
                        "lv_bus": "S2_LV_BUS",
                        "loads": ["LOAD_S2"],
                        "capacitors": [{"name": "CAP_S2", "rating": 0}],  # 折入 TR-15 運轉功因(實裝165)
                    }
                ]
            }
        ]
    },

    "VCB9": {
        "name": "VCB9 · J",
        "bus_id": "CU_BUS",
        "cable_to_bus": {"cross_section": 38, "length": 42 * 1.2, "resistance": 0.5, "reactance": 0.07},
        "substations": [
            {
                "bus": "J_BUS",
                "transformers": [
                    {"name": "TR_J", "capacity": 500, "voltage_hv": 11.4, "voltage_lv": 0.22, "lv_bus": "J_LV_BUS", "loads": ["LOAD_J"]}
                ]
            }
        ]
    },

    "VCB10": {
        "name": "VCB10 · W",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "W_BUS",
                "cable": {"cross_section": 60, "length": 435 * 1.2},
                "transformers": [
                    {"name": "TR_W_1", "capacity": 1500, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "W1_LV_BUS", "loads": ["LOAD_W1"]},
                    {"name": "TR_W_4", "capacity": 750, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.19, "lv_bus": "W4_LV_BUS", "loads": ["LOAD_W4"]},
                ]
            },
            {
                "bus": "W_BUS1",
                "transformers": [
                    {"name": "TR_W_2", "capacity": 1500, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "W2_LV_BUS", "loads": ["LOAD_W2"]},
                    {
                        "name": "TR_W_3",
                        "capacity": 500,
                        "voltage_hv": 11.4,
                        "voltage_lv": 0.38,
                        "lv_bus": "W3_LV_BUS",
                        "type": "乾",
                        "loads": ["LOAD_W3"],
                        "capacitors": [{"name": "CAP_W3", "rating": 0}],  # 折入 TR-46 運轉功因(實裝200)
                    }
                ]
            }
        ]
    },

    "VCB11": {
        "name": "VCB11 · I",
        "bus_id": "CU_BUS",
        "substations": [
            {
                "bus": "I_BUS",
                "cable": {"cross_section": 60, "length": 63 * 1.2},
                "transformers": [
                    {"name": "TR_I_1", "capacity": 1500, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "I1_LV_BUS", "loads": ["LOAD_I1"]},
                    {"name": "TR_I_2", "capacity": 1500, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.38, "lv_bus": "I2_LV_BUS", "loads": ["LOAD_I2"]},
                    {"name": "TR_I_3", "capacity": 750, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.19, "lv_bus": "I3_LV_BUS", "loads": ["LOAD_I3"]},
                    {"name": "TR_I_4", "capacity": 750, "type": "乾", "voltage_hv": 11.4, "voltage_lv": 0.19, "lv_bus": "I4_LV_BUS", "loads": ["LOAD_I4"]},
                ]
            }
        ]
    },

    "VCB12": {
        "name": "VCB12 - 電容補償饋線",
        "bus_id": "CU_BUS",
        # 純電容補償饋線: 主母線 →[250mm²×3 電纜]→ CB_BUS → 並聯電容 CAP_VB
        "shunt_feeder": {
            "bus": "CB_BUS",
            "bus_vn_kv": 11.4,   # CB_BUS 電氣電壓 (與系統同;13.8 為電容額定)
            "cable": {"cross_section": 250, "quantity": 3,
                      "resistance": 0.09, "reactance": 0.07,
                      "length": 100, "length_unknown": True},  # 長度未知，假設值
            "capacitor": {"name": "CAP_VB", "rating": 600, "rated_kv": 13.8},  # kVAr @ 13.8kV
        },
    }
}

# 電纜參數（標準60mm²和38mm²）
CABLE_PARAMETERS = {
    60: {"resistance": 0.32, "reactance": 0.07},  # Ω/km
    38: {"resistance": 0.5, "reactance": 0.07},   # Ω/km
}

# 變壓器標準參數
TRANSFORMER_IMPEDANCE = {
    200: 0.045,   # Z% for 200kVA
    250: 0.045,
    300: 0.045,
    400: 0.045,
    500: 0.045,
    600: 0.045,
    750: 0.045,
    1250: 0.06,
    1500: 0.06,
}
