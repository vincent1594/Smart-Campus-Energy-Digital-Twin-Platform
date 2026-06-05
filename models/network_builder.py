"""
PandaPower Network Builder for Campus Distribution System
從拓撲定義構建完整的 PandaPower 電力系統模型
"""

import pandapower as pp
import numpy as np
from typing import Dict, Tuple
import logging

# 直接導入數據
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.network_structure import FEEDERS, MAIN_NETWORK, CABLE_PARAMETERS, TRANSFORMER_IMPEDANCE
from data.load_data import DEFAULT_BUILDING_LOADS
from data.parameters import (SYSTEM_PARAMS, CABLE_PARAMS, TRANSFORMER_PARAMS, PANDAPOWER_CONFIG,
                             LOAD_PARAMS, SYSTEM_COINCIDENT_PEAK_KW, get_transformer_loss)

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# 主要 Network Builder 函數
# ============================================================================

def build_network_s1_baseline():
    """
    構建 S1 Baseline PandaPower 網路
    
    返回:
        pp.pandapower.Network: 完整的 PandaPower 網路，準備進行潮流計算
    """
    
    logger.info("=" * 70)
    logger.info("開始構建 S1 Baseline PandaPower 網路")
    logger.info("=" * 70)

    # 計算分散係數：各台「平均負載」為非同時值，整體縮放到系統同時尖峰
    raw_total_kw = sum(ld["p_kw"] for ld in DEFAULT_BUILDING_LOADS.values())
    if SYSTEM_COINCIDENT_PEAK_KW and raw_total_kw > 0:
        load_scale = SYSTEM_COINCIDENT_PEAK_KW / raw_total_kw
        logger.info(f"負載基礎: 各台實載加總 {raw_total_kw:.1f} kW → 系統同時負載 "
                    f"{SYSTEM_COINCIDENT_PEAK_KW:.0f} kW (分散係數 {load_scale:.3f})")
    else:
        load_scale = 1.0
        logger.info(f"負載基礎: 各台實載加總 {raw_total_kw:.1f} kW (未套用分散係數)")
    
    # 1. 創建新的 PandaPower 網路
    net = pp.create_empty_network(
        name="Campus 11.4kV Distribution Network - S1 Baseline"
    )
    net.f_hz = SYSTEM_PARAMS["frequency"]
    
    # 2. 添加主 11.4kV 母線和發電源
    main_bus = _add_main_source(net)
    logger.info(f"✓ 添加主母線: {main_bus} (11.4kV)")
    
    # 3. 遍歷所有 12 個 feeders，構建網路
    bus_count = 1
    trafo_count = 0
    line_count = 0
    load_count = 0
    hv_bus_by_name = {}  # HV 母線名稱 -> 索引 (供 parent_bus 掛接查詢)

    for vcb_name, vcb_def in FEEDERS.items():
        if vcb_name == "VCB12":
            # VCB12 特殊處理（只有電容器，暫時跳過）
            logger.warning(f"⚠ {vcb_name} 未完全定義（只有電容器），跳過")
            continue
        
        logger.info(f"\n[{vcb_name}] 開始構建 {vcb_def['name']}")
        
        # 檢查是否有 cable_to_bus（中間電纜連接）
        if "cable_to_bus" in vcb_def:
            cable_spec = vcb_def["cable_to_bus"]
            intermediate_bus = _add_hv_bus(net, f"{vcb_name}_INTERMEDIATE_BUS", 11.4)
            line_count += _add_hv_line(
                net, main_bus, intermediate_bus, cable_spec, vcb_name
            )
            logger.info(f"  └─ 添加中間匯流排及電纜 (cross={cable_spec['cross_section']}mm²)")
        else:
            intermediate_bus = main_bus
        
        # 遍歷該 feeder 的所有變電站
        for substation in vcb_def.get("substations", []):
            hv_bus = substation.get("bus")
            # 上游連接點：預設為 feeder 中間/主母線；若指定 parent_bus 則掛在該母線下游
            parent = substation.get("parent_bus")
            from_bus = hv_bus_by_name.get(parent, intermediate_bus) if parent else intermediate_bus

            # 如果定義了電纜到次級母線
            if "cable" in substation:
                cable_spec = substation["cable"]
                hv_bus_id = _add_hv_bus(net, hv_bus, 11.4)
                line_count += _add_hv_line(
                    net, from_bus, hv_bus_id, cable_spec, f"{vcb_name}_{hv_bus}"
                )
                src = f"{parent}" if parent else "feeder母線"
                logger.info(f"  ├─ {hv_bus}: 自 {src} 接電纜 (cross={cable_spec['cross_section']}mm², len={cable_spec['length']}m)")
            else:
                # 無電纜資料：以閉合母線開關直接耦合到上游母線，避免母線懸空成孤島
                hv_bus_id = _add_hv_bus(net, hv_bus, 11.4)
                pp.create_switch(
                    net, bus=from_bus, element=hv_bus_id,
                    et="b", closed=True, name=f"{vcb_name}_{hv_bus}_couple"
                )
                logger.info(f"  ├─ {hv_bus}: 無電纜，以母線開關耦合至上游母線")

            hv_bus_by_name[hv_bus] = hv_bus_id  # 登錄供下游 parent_bus 查詢
            
            # 遍歷該變電站的變壓器
            for trafo in substation.get("transformers", []):
                # 跳過停用的變壓器
                if trafo.get("status") == "disabled":
                    logger.info(f"    ├─ ⊘ {trafo['name']} ({trafo['capacity']}kVA) - 停用")
                    continue
                
                trafo_count += 1
                lv_voltage = trafo.get("voltage_lv", 0.22)
                capacity = trafo.get("capacity")
                
                # 添加 LV 母線
                lv_bus_id = _add_lv_bus(net, trafo["lv_bus"], lv_voltage)
                
                # 添加變壓器
                trafo_type = trafo.get("type", "油")  # 預設油浸式
                trafo_id = _add_transformer(
                    net, hv_bus_id, lv_bus_id, trafo["name"],
                    capacity, lv_voltage, trafo_type
                )
                logger.info(f"    ├─ {trafo['name']}: {capacity}kVA {trafo_type}式 ({11.4}/{lv_voltage}kV)")
                
                # 添加負載（如有）
                for load_name in trafo.get("loads", []):
                    if load_name in DEFAULT_BUILDING_LOADS:
                        load_data = DEFAULT_BUILDING_LOADS[load_name]
                        p_kw = load_data["p_kw"] * load_scale  # 套用分散係數縮放至同時尖峰
                        # 依各負載運轉功因推算 Q = P * tan(acos(pf))；
                        # 無 pf 時退回系統預設功率因數
                        if load_data.get("q_kvar"):
                            q_kvar = load_data["q_kvar"] * load_scale
                        else:
                            pf = load_data.get("pf", LOAD_PARAMS["default_power_factor"])
                            q_kvar = p_kw * np.tan(np.arccos(pf))
                        pp.create_load(
                            net, lv_bus_id,
                            p_mw=p_kw / 1000,  # 轉換為 MW
                            q_mvar=q_kvar / 1000,  # 轉換為 MVar
                            name=load_name,
                            index=load_count
                        )
                        load_count += 1
                        logger.info(f"      └─ LOAD {load_name}: {p_kw:.1f}kW, Q={q_kvar:.1f}kVAr")
                
                # 添加電容器（如有）
                for capacitor in trafo.get("capacitors", []):
                    if capacitor.get("rating", 0) > 0:
                        pp.create_shunt(
                            net, lv_bus_id,
                            # pandapower 慣例: shunt q_mvar 正值=吸收無功(電抗器)，
                            # 電容器供給無功，故取負值
                            q_mvar=-capacitor["rating"] / 1000,
                            name=capacitor["name"]
                        )
                        logger.info(f"      └─ CAP {capacitor['name']}: {capacitor['rating']}kVAr")
    
    # 4. 網路驗證
    logger.info("\n" + "=" * 70)
    logger.info("網路統計:")
    logger.info(f"  主母線: 1 個")
    logger.info(f"  HV 母線 (11.4kV): {len(net.bus[net.bus['vn_kv'] == 11.4])} 個")
    logger.info(f"  LV 母線 (0.22/0.38kV): {len(net.bus[net.bus['vn_kv'] != 11.4])} 個")
    logger.info(f"  HV 電纜: {line_count} 條")
    logger.info(f"  變壓器: {trafo_count} 個")
    logger.info(f"  負載: {load_count} 個")
    logger.info(f"  總功率: {net.load['p_mw'].sum() * 1000:.1f} kW")
    logger.info(f"  總無功: {net.load['q_mvar'].sum() * 1000:.1f} kVAr")
    logger.info("=" * 70 + "\n")
    
    return net


# ============================================================================
# 輔助函數
# ============================================================================

def _add_main_source(net):
    """
    添加台電電源、校內受電母線，及兩者之間的進線主纜

    台電端進線主纜長度未知，以假設值計算 (見 MAIN_NETWORK.main_cable)。
    回傳校內受電母線 (各饋線由此分出)。
    """
    # 台電端電源母線 (Slack)
    source_bus = pp.create_bus(net, name="TPC_SOURCE_11.4kV", vn_kv=11.4, type="b")
    pp.create_ext_grid(
        net, source_bus,
        vm_pu=1.0,
        va_degree=0.0,
        name="台電 11.4kV 電源"
    )

    # 校內受電母線
    main_bus = pp.create_bus(net, name="TPC_11.4kV", vn_kv=11.4, type="b")

    # 台電進線主纜 (250mm²，長度未知)
    mc = MAIN_NETWORK["main_cable"]
    qty = mc.get("quantity", 1)
    length_km = mc.get("length", 100) / 1000.0  # 長度未知，假設值
    amp = CABLE_PARAMS.get(mc["cross_section"], {}).get("rating_a", 418) * qty
    line_idx = pp.create_line_from_parameters(
        net, source_bus, main_bus,
        length_km=length_km,
        r_ohm_per_km=mc["resistance"] / qty,   # 並聯 qty 條
        x_ohm_per_km=mc["reactance"] / qty,
        c_nf_per_km=0,
        max_i_ka=amp / 1000,
        name="TPC_MAIN_INCOMING"
    )
    net.line.at[line_idx, "cross_section_mm2"] = mc["cross_section"]
    net.line.at[line_idx, "length_unknown"] = bool(mc.get("length_unknown", False))
    if mc.get("length_unknown"):
        logger.info(f"✓ 台電進線主纜: {mc['cross_section']}mm²×{qty}, 長度未知 (假設 {mc.get('length',100)}m)")

    return main_bus


def _add_hv_bus(net, bus_name: str, voltage: float = 11.4):
    """
    添加 HV 母線 (11.4kV)
    """
    return pp.create_bus(net, name=bus_name, vn_kv=voltage, type="m")


def _add_lv_bus(net, bus_name: str, voltage: float = 0.22):
    """
    添加 LV 母線 (0.22 or 0.38 kV)
    """
    return pp.create_bus(net, name=bus_name, vn_kv=voltage, type="n")


def _add_hv_line(net, from_bus, to_bus, cable_spec: Dict, line_name: str):
    """
    添加 HV 電纜 (11.4kV)
    
    参数:
        from_bus: 起始母線索引
        to_bus: 終止母線索引
        cable_spec: {'cross_section': mm², 'length': m}
        line_name: 電纜名稱
    
    返回:
        添加的電纜數量
    """
    cross_section = cable_spec["cross_section"]
    length_km = cable_spec["length"] / 1000.0
    
    if cross_section not in CABLE_PARAMS:
        logger.warning(f"⚠ 電纜規格 {cross_section}mm² 未定義，使用默認值")
        r_per_km = 0.32
        x_per_km = 0.07
        ampacity = 143
    else:
        cable_info = CABLE_PARAMS[cross_section]
        r_per_km = cable_info["r_per_km"]
        x_per_km = cable_info["x_per_km"]
        ampacity = cable_info["rating_a"]
    
    line_idx = pp.create_line_from_parameters(
        net, from_bus, to_bus,
        length_km=length_km,
        r_ohm_per_km=r_per_km,
        x_ohm_per_km=x_per_km,
        c_nf_per_km=0,  # 暫時忽略電容
        max_i_ka=ampacity / 1000,
        name=line_name
    )

    # 記錄線徑 (pandapower 預設不存)，供報告輸出
    net.line.at[line_idx, "cross_section_mm2"] = cross_section

    return 1


def _add_transformer(net, hv_bus, lv_bus, trafo_name: str, capacity_kva: int,
                     lv_voltage: float, trafo_type: str = "油"):
    """
    添加變壓器

    参数:
        hv_bus: HV 母線索引
        lv_bus: LV 母線索引
        trafo_name: 變壓器名稱
        capacity_kva: 容量 (kVA)
        lv_voltage: LV 側電壓 (kV)
        trafo_type: 型式 ("油"/"乾")，決定查表損耗

    返回:
        變壓器索引
    """
    # 短路阻抗 (vk%)
    vk_percent = TRANSFORMER_IMPEDANCE.get(capacity_kva, 0.045) * 100  # 表中為小數 (0.045=4.5%)，轉為百分比

    # 由標準損耗表查空載損(鐵損)與滿載銅損，取代舊的 1%/2% 容量假設
    pfe_kw, pcu_kw = get_transformer_loss(trafo_type, capacity_kva)
    # 滿載銅損 → 電阻電壓百分比 vkr% = Pk / Sn × 100
    vkr_percent = (pcu_kw / capacity_kva) * 100 if capacity_kva > 0 else 0
    # 空載損 → 激磁電流百分比 (近似)，使 i0 與鐵損一致
    i0_percent = max(0.1, (pfe_kw / capacity_kva) * 100)

    trafo_idx = pp.create_transformer_from_parameters(
        net, hv_bus, lv_bus,
        sn_mva=capacity_kva / 1000,
        vn_hv_kv=11.4,
        vn_lv_kv=lv_voltage,
        vk_percent=vk_percent,
        vkr_percent=vkr_percent,
        pfe_kw=pfe_kw,
        i0_percent=i0_percent,
        name=trafo_name
    )
    # 記錄型式供報告
    net.trafo.at[trafo_idx, "trafo_type"] = trafo_type

    return trafo_idx


# ============================================================================
# 驗證函數
# ============================================================================

def validate_network(net):
    """
    驗證 PandaPower 網路拓撲
    """
    logger.info("驗證網路拓撲...")
    
    # 檢查基本結構
    assert len(net.bus) > 0, "網路中沒有母線"
    assert len(net.ext_grid) > 0, "網路中沒有電壓源"
    assert len(net.load) > 0, "網路中沒有負載"
    
    # 檢查連通性
    assert len(net.trafo) > 0, "網路中沒有變壓器"
    
    logger.info("✓ 網路拓撲驗證通過")
    
    return True


def print_network_summary(net):
    """
    打印網路摘要
    """
    print("\n" + "=" * 70)
    print("PandaPower 網路摘要 (S1 Baseline)")
    print("=" * 70)
    
    print(f"\n母線統計:")
    print(f"  11.4kV 母線: {len(net.bus[net.bus['vn_kv'] == 11.4])}")
    print(f"  0.22kV 母線: {len(net.bus[net.bus['vn_kv'] == 0.22])}")
    print(f"  0.38kV 母線: {len(net.bus[net.bus['vn_kv'] == 0.38])}")
    print(f"  總計: {len(net.bus)}")
    
    print(f"\n電路元件:")
    print(f"  外部電網: {len(net.ext_grid)}")
    print(f"  HV 電纜: {len(net.line)}")
    print(f"  變壓器: {len(net.trafo)}")
    print(f"  負載: {len(net.load)}")
    print(f"  電容器: {len(net.shunt)}")
    
    print(f"\n功率統計:")
    print(f"  總負載功率: {net.load['p_mw'].sum() * 1000:.1f} kW")
    print(f"  總負載無功: {net.load['q_mvar'].sum() * 1000:.1f} kVAr")
    print(f"  總電容器: {net.shunt['q_mvar'].sum() * 1000:.1f} kVAr")
    
    print("=" * 70 + "\n")


if __name__ == "__main__":
    # 測試網路構建
    net = build_network_s1_baseline()
    print_network_summary(net)
    validate_network(net)
