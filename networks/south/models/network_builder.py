"""
南電錶 — PandaPower 網路建構器
從拓樸定義 (data/network_structure.py) 構建完整的 PandaPower 電力系統模型。
"""

import pandapower as pp
import numpy as np
import logging
import sys
from pathlib import Path

pass  # [phase0] sys.path.insert removed

from networks.south.data.network_structure import FEEDERS, MAIN_NETWORK, TRANSFORMER_IMPEDANCE
from networks.south.data.load_data import DEFAULT_BUILDING_LOADS
from networks.south.data.parameters import (SYSTEM_PARAMS, CABLE_PARAMS, PANDAPOWER_CONFIG,
                             LOAD_PARAMS, SYSTEM_COINCIDENT_PEAK_KW, get_transformer_loss)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# 主要 Network Builder
# ============================================================================
def build_network_s1_baseline():
    """構建南電錶 PandaPower 網路，回傳準備好潮流計算的 net。"""
    logger.info("=" * 70)
    logger.info("開始構建 南電錶 11.4kV PandaPower 網路")
    logger.info("=" * 70)

    # 負載基礎: 各台平均負載；若情境指定系統同時負載則整體縮放 (分散係數)
    raw_total_kw = sum(ld["p_kw"] for ld in DEFAULT_BUILDING_LOADS.values())
    load_scale = 1.0
    if SYSTEM_COINCIDENT_PEAK_KW and raw_total_kw > 0:
        load_scale = SYSTEM_COINCIDENT_PEAK_KW / raw_total_kw
        logger.info(f"負載基礎: 各台加總 {raw_total_kw:.1f} kW → 系統同時負載 "
                    f"{SYSTEM_COINCIDENT_PEAK_KW:.0f} kW (分散係數 {load_scale:.3f})")
    else:
        logger.info(f"負載基礎: 各台負載直接加總 {raw_total_kw:.1f} kW (未套用分散係數)")

    # 1. 空網路
    net = pp.create_empty_network(name="Campus 11.4kV Distribution (South) - S1 Baseline")
    net.f_hz = SYSTEM_PARAMS["frequency"]

    # 2. 台電電源 + CU_BUS 受電母線 + 進線主纜
    main_bus = _add_main_source(net)
    logger.info(f"✓ 添加 CU_BUS 受電母線 (11.4kV)")

    # 3. 遍歷各 VCB
    trafo_count = line_count = load_count = 0
    hv_bus_by_name = {}

    for vcb_name, vcb_def in FEEDERS.items():
        # 3a. 純電容補償饋線 (VCB5): CU_BUS →開關→ CB_BUS →並聯電容
        if "shunt_feeder" in vcb_def:
            sf = vcb_def["shunt_feeder"]
            cb_bus = _add_hv_bus(net, sf["bus"], sf.get("bus_vn_kv", 11.4))
            pp.create_switch(net, bus=main_bus, element=cb_bus, et="b", closed=True,
                             name=f"{vcb_name}_{sf['bus']}_couple")
            cap = sf["capacitor"]
            pp.create_shunt(net, cb_bus, q_mvar=-cap["rating"] / 1000.0,
                            vn_kv=cap.get("rated_kv", sf.get("bus_vn_kv", 11.4)),
                            name=cap["name"])
            hv_bus_by_name[sf["bus"]] = cb_bus
            logger.info(f"\n[{vcb_name}] {vcb_def['name']}: {sf['bus']} 並聯電容 "
                        f"{cap['name']} {cap['rating']}kVAr@{cap.get('rated_kv')}kV")
            continue

        logger.info(f"\n[{vcb_name}] 開始構建 {vcb_def['name']}")

        # 3b. CU_BUS → 饋線母線 之進線電纜
        if "cable_to_bus" in vcb_def:
            cable_spec = vcb_def["cable_to_bus"]
            feeder_bus = _add_hv_bus(net, f"{vcb_name}_FEEDER_BUS", 11.4)
            line_count += _add_hv_line(net, main_bus, feeder_bus, cable_spec, f"{vcb_name}_FEEDER")
            logger.info(f"  └─ 進線電纜 {cable_spec['cross_section']}mm² "
                        f"(len={'未知' if cable_spec.get('length_unknown') else cable_spec['length']}m)")
        else:
            feeder_bus = main_bus

        # 3c. 各變電站
        for substation in vcb_def.get("substations", []):
            hv_name = substation.get("bus")
            hv_bus_id = _add_hv_bus(net, hv_name, 11.4)
            # 饋線母線 → 變電站 HV 母線 (本資料無段間電纜，以閉合母線開關耦合)
            pp.create_switch(net, bus=feeder_bus, element=hv_bus_id, et="b", closed=True,
                             name=f"{vcb_name}_{hv_name}_couple")
            hv_bus_by_name[hv_name] = hv_bus_id
            logger.info(f"  ├─ {hv_name}")

            for trafo in substation.get("transformers", []):
                if trafo.get("status") == "disabled":
                    logger.info(f"    ├─ ⊘ {trafo['name']} ({trafo['capacity']}kVA) - 停用")
                    continue
                trafo_count += 1
                lv_voltage = trafo.get("voltage_lv", 0.22)
                capacity = trafo.get("capacity")
                lv_bus_id = _add_lv_bus(net, trafo["lv_bus"], lv_voltage)
                trafo_type = trafo.get("type", "油")
                _add_transformer(net, hv_bus_id, lv_bus_id, trafo["name"],
                                 capacity, lv_voltage, trafo_type)
                logger.info(f"    ├─ {trafo['name']}: {capacity}kVA {trafo_type}式 (11.4/{lv_voltage}kV)")

                # 負載
                for load_name in trafo.get("loads", []):
                    if load_name in DEFAULT_BUILDING_LOADS:
                        ld = DEFAULT_BUILDING_LOADS[load_name]
                        p_kw = ld["p_kw"] * load_scale
                        pf = ld.get("pf", LOAD_PARAMS["default_power_factor"])
                        q_kvar = p_kw * np.tan(np.arccos(pf))
                        pp.create_load(net, lv_bus_id, p_mw=p_kw / 1000, q_mvar=q_kvar / 1000,
                                       name=load_name, index=load_count)
                        load_count += 1
                        logger.info(f"      └─ LOAD {load_name}: {p_kw:.1f}kW, Q={q_kvar:.1f}kVAr")

                # 並聯電容 (顯式 shunt)
                for capacitor in trafo.get("capacitors", []):
                    if capacitor.get("rating", 0) > 0:
                        # pandapower 慣例: shunt q_mvar 正值=吸收無功;電容器供給無功 → 取負
                        pp.create_shunt(net, lv_bus_id, q_mvar=-capacitor["rating"] / 1000,
                                        name=capacitor["name"])
                        logger.info(f"      └─ CAP {capacitor['name']}: {capacitor['rating']}kVAr")

    logger.info("\n" + "=" * 70)
    logger.info("網路統計:")
    logger.info(f"  HV 母線 (11.4kV): {len(net.bus[net.bus['vn_kv'] == 11.4])} 個")
    logger.info(f"  LV 母線: {len(net.bus[net.bus['vn_kv'] != 11.4])} 個")
    logger.info(f"  HV 電纜: {line_count} 條   變壓器: {trafo_count} 台   負載: {load_count} 個")
    logger.info(f"  總負載: {net.load['p_mw'].sum()*1000:.1f} kW / {net.load['q_mvar'].sum()*1000:.1f} kVAr")
    logger.info(f"  電容器: {len(net.shunt)} 組 ({-net.shunt['q_mvar'].sum()*1000:.0f} kVAr 名目)")
    logger.info("=" * 70 + "\n")
    return net


# ============================================================================
# 輔助函數
# ============================================================================
def _add_main_source(net):
    """添加台電電源、CU_BUS 受電母線及進線主纜。回傳 CU_BUS 索引。"""
    source_bus = pp.create_bus(net, name="TPC_SOURCE_11.4kV", vn_kv=11.4, type="b")
    pp.create_ext_grid(net, source_bus, vm_pu=1.0, va_degree=0.0, name="台電 11.4kV 電源")

    main_bus = pp.create_bus(net, name="CU_BUS", vn_kv=11.4, type="b")

    mc = MAIN_NETWORK["main_cable"]
    qty = mc.get("quantity", 1)
    amp = CABLE_PARAMS.get(mc["cross_section"], {}).get("rating_a", 418) * qty
    li = pp.create_line_from_parameters(
        net, source_bus, main_bus,
        length_km=mc.get("length", 100) / 1000.0,
        r_ohm_per_km=mc["resistance"] / qty,
        x_ohm_per_km=mc["reactance"] / qty,
        c_nf_per_km=0, max_i_ka=amp / 1000,
        name="TPC_MAIN_INCOMING")
    net.line.at[li, "cross_section_mm2"] = mc["cross_section"]
    net.line.at[li, "length_unknown"] = bool(mc.get("length_unknown", False))
    if mc.get("length_unknown"):
        logger.info(f"✓ 台電進線主纜: {mc['cross_section']}mm²×{qty}, 長度未知 (假設 {mc.get('length',100)}m)")
    return main_bus


def _add_hv_bus(net, bus_name, voltage=11.4):
    return pp.create_bus(net, name=bus_name, vn_kv=voltage, type="m")


def _add_lv_bus(net, bus_name, voltage=0.22):
    return pp.create_bus(net, name=bus_name, vn_kv=voltage, type="n")


def _add_hv_line(net, from_bus, to_bus, cable_spec, line_name):
    """添加 HV 電纜 (11.4kV)，回傳新增條數 (1)。"""
    cross_section = cable_spec["cross_section"]
    length_km = cable_spec["length"] / 1000.0
    info = CABLE_PARAMS.get(cross_section)
    if info is None:
        logger.warning(f"⚠ 電纜規格 {cross_section}mm² 未定義，使用默認值")
        r_per_km, x_per_km, ampacity = 0.32, 0.07, 143
    else:
        r_per_km, x_per_km, ampacity = info["r_per_km"], info["x_per_km"], info["rating_a"]
    li = pp.create_line_from_parameters(
        net, from_bus, to_bus, length_km=length_km,
        r_ohm_per_km=r_per_km, x_ohm_per_km=x_per_km,
        c_nf_per_km=0, max_i_ka=ampacity / 1000, name=line_name)
    net.line.at[li, "cross_section_mm2"] = cross_section
    net.line.at[li, "length_unknown"] = bool(cable_spec.get("length_unknown", False))
    return 1


def _add_transformer(net, hv_bus, lv_bus, trafo_name, capacity_kva, lv_voltage, trafo_type="油"):
    """添加變壓器，回傳索引。"""
    vk_percent = TRANSFORMER_IMPEDANCE.get(capacity_kva, 0.045) * 100
    pfe_kw, pcu_kw = get_transformer_loss(trafo_type, capacity_kva)
    vkr_percent = (pcu_kw / capacity_kva) * 100 if capacity_kva > 0 else 0
    i0_percent = max(0.1, (pfe_kw / capacity_kva) * 100)
    ti = pp.create_transformer_from_parameters(
        net, hv_bus, lv_bus,
        sn_mva=capacity_kva / 1000, vn_hv_kv=11.4, vn_lv_kv=lv_voltage,
        vk_percent=vk_percent, vkr_percent=vkr_percent,
        pfe_kw=pfe_kw, i0_percent=i0_percent, name=trafo_name)
    net.trafo.at[ti, "trafo_type"] = trafo_type
    return ti


# ============================================================================
# 驗證 / 摘要
# ============================================================================
def validate_network(net):
    assert len(net.bus) > 0, "網路中沒有母線"
    assert len(net.ext_grid) > 0, "網路中沒有電壓源"
    assert len(net.load) > 0, "網路中沒有負載"
    assert len(net.trafo) > 0, "網路中沒有變壓器"
    logger.info("✓ 網路拓撲驗證通過")
    return True


def print_network_summary(net):
    print("\n" + "=" * 70)
    print("PandaPower 網路摘要 (南電錶 S1 Baseline)")
    print("=" * 70)
    print(f"  11.4kV 母線: {len(net.bus[net.bus['vn_kv'] == 11.4])}")
    print(f"  LV 母線: {len(net.bus[net.bus['vn_kv'] != 11.4])}")
    print(f"  外部電網: {len(net.ext_grid)}  HV電纜: {len(net.line)}  變壓器: {len(net.trafo)}")
    print(f"  負載: {len(net.load)}  電容器: {len(net.shunt)}")
    print(f"  總負載: {net.load['p_mw'].sum()*1000:.1f} kW / {net.load['q_mvar'].sum()*1000:.1f} kVAr")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    net = build_network_s1_baseline()
    print_network_summary(net)
    validate_network(net)
