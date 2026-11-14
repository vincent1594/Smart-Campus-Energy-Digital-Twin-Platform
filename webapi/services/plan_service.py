"""規劃模擬 —— 在 base net 的 deepcopy 上「疊加」使用者擺的規劃建物,重跑潮流。

接法 A(此版唯一支援):每棟規劃建物自受電匯流排(TPC_11.4kV)新拉一路獨立饋線 →
  進站 HV 母線 → N 台變壓器(各自 LV 母線 + 負載)。base net 永不被汙染(動的是 clone)。

護欄:讀新增變壓器 / 進站電纜 / 站內低壓母線的潮流結果,把過載、低壓翻成白話警告。
map_power_flow 只走 domain model(不含新增元件),故新增元件的負載率在此另讀 net.res_* 補上。
"""
from __future__ import annotations

import copy

import numpy as np
import pandapower as pp

from networks.north.data.parameters import CABLE_PARAMS
from networks.north.models.network_builder import _add_transformer  # 複用:vk/vkr/pfe/i0 由容量+型式查表
from webapi import state
from webapi.powerflow import solve_net
from webapi.schemas import (
    FeederLoading,
    PlanBuildingLoading,
    PlanSimulateRequest,
    PlanSimulateResult,
    TransformerLoading,
)

MAIN_BUS_NAME = "TPC_11.4kV"   # 校內受電匯流排(各饋線由此分出);見 network_builder._add_main_source
DEFAULT_CROSS = 60             # 預設進站電纜線徑 mm²(常見饋線規格,CABLE_PARAMS 內)
DEFAULT_CABLE = {"r_per_km": 0.32, "x_per_km": 0.07, "rating_a": 143}


def _add_feeder_cable(net, from_bus: int, to_bus: int, cross: int, length_m: float, name: str) -> int:
    info = CABLE_PARAMS.get(cross, DEFAULT_CABLE)
    li = pp.create_line_from_parameters(
        net, from_bus, to_bus,
        length_km=max(length_m, 1.0) / 1000.0,
        r_ohm_per_km=info["r_per_km"], x_ohm_per_km=info["x_per_km"],
        c_nf_per_km=0, max_i_ka=info["rating_a"] / 1000.0, name=name,
    )
    net.line.at[li, "cross_section_mm2"] = cross
    return int(li)


def simulate_plan(req: PlanSimulateRequest) -> PlanSimulateResult:
    base = state.get_base()
    base_result = state.get_base_result()
    net = copy.deepcopy(base.net)            # ★ 動的是 clone
    model = base.model

    main_hits = net.bus.index[net.bus["name"] == MAIN_BUS_NAME]
    if len(main_hits) == 0:
        raise ValueError(f"找不到受電匯流排 {MAIN_BUS_NAME},無法疊加規劃建物")
    main_bus = int(main_hits[0])

    added_tr: list[tuple[str, int, float]] = []   # (顯示名, trafo idx, 容量 kVA)
    added_ln: list[tuple[str, int, int]] = []     # (顯示名, line idx, 線徑)
    lv_buses: list[tuple[str, int]] = []          # (建物名, lv bus idx) 供低壓檢查
    # (建物 id, 建物名, [該棟 trafo idx], [該棟 lv bus idx]) 供每棟上色 + 電壓
    building_rows: list[tuple[str, str, list[int], list[int]]] = []

    for b in req.buildings:
        active = [t for t in b.transformers if t.capacity_kva and t.capacity_kva > 0]
        if not active:
            continue   # 無有效變壓器 → 不成站,略過

        hv_bus = pp.create_bus(net, name=f"PLAN_{b.id}_HV", vn_kv=11.4, type="m")
        cross = int(b.cross_section_mm2) if b.cross_section_mm2 else DEFAULT_CROSS
        li = _add_feeder_cable(net, main_bus, hv_bus, cross, b.cable_length_m, f"PLAN_{b.id}_FEEDER")
        added_ln.append((f"{b.name} 進站電纜", li, cross))

        tr_idxs: list[int] = []
        lv_idxs: list[int] = []
        for k, t in enumerate(active, 1):
            lv = float(t.lv_voltage) or 0.38
            lv_bus = pp.create_bus(net, name=f"PLAN_{b.id}_LV{k}", vn_kv=lv, type="n")
            tr_name = f"{b.name}-TR{k}"
            ti = _add_transformer(net, hv_bus, lv_bus, tr_name, float(t.capacity_kva), lv, "油")
            added_tr.append((tr_name, int(ti), float(t.capacity_kva)))
            tr_idxs.append(int(ti))
            lv_idxs.append(int(lv_bus))
            lv_buses.append((b.name, int(lv_bus)))

            p_kw = max(0.0, float(t.load_kw))
            pf = min(max(float(t.pf) or 0.9, 0.1), 1.0)
            q_kvar = p_kw * float(np.tan(np.arccos(pf)))
            pp.create_load(net, lv_bus, p_mw=p_kw / 1000.0, q_mvar=q_kvar / 1000.0, name=f"PLAN_{b.id}_L{k}")
        building_rows.append((b.id, b.name, tr_idxs, lv_idxs))

    # 沒有任何可疊加的建物 → 回現況(避免空跑)
    if not added_tr:
        return PlanSimulateResult(base=base_result, scenario=base_result, warnings=["沒有可模擬的規劃建物(請先設定變壓器容量)"])

    scenario = solve_net(model, net, base.index)   # base.index 對既有元件仍有效(deepcopy 保留索引)

    warnings: list[str] = []

    added_transformers: list[TransformerLoading] = []
    for name, idx, cap in added_tr:
        ratio = round(float(net.res_trafo.loading_percent.at[idx]), 1)
        added_transformers.append(TransformerLoading(
            transformer_id=f"PLAN_TR_{idx}", transformer_name=name, capacity_kva=round(cap, 1),
            actual_load_kva=round(ratio / 100.0 * cap, 1), load_ratio_percent=ratio,
        ))
        if ratio > 100:
            warnings.append(f"⚠ {name} 變壓器過載 {ratio:.0f}%（{cap:.0f} kVA 容量不足,建議加大或分載）")
        elif ratio > 90:
            warnings.append(f"{name} 變壓器吃緊 {ratio:.0f}%（接近滿載）")

    added_feeders: list[FeederLoading] = []
    for name, idx, cross in added_ln:
        ratio = round(float(net.res_line.loading_percent.at[idx]), 1)
        added_feeders.append(FeederLoading(feeder_id=f"PLAN_FD_{idx}", feeder_name=name, load_ratio_percent=ratio))
        if ratio > 100:
            warnings.append(f"⚠ {name} 過載 {ratio:.0f}%（{cross}mm² 電纜載流不足,建議加大線徑或縮短距離）")
        elif ratio > 90:
            warnings.append(f"{name} 吃緊 {ratio:.0f}%")

    # 站內低壓母線電壓(過長電纜 / 過大負載會壓降)
    for bname, bus in lv_buses:
        vm = float(net.res_bus.vm_pu.at[bus])
        if vm < 0.95:
            warnings.append(f"⚠ {bname} 低壓側電壓偏低 {vm:.3f} pu（壓降過大,建議縮短電纜或加大容量）")

    # 每棟:負載率 = 最大變壓器負載率;電壓 = 最低低壓母線 vm(供地圖上色 + 顯示)
    building_loadings = [
        PlanBuildingLoading(
            id=bid, name=bname,
            load_ratio_percent=round(max(float(net.res_trafo.loading_percent.at[i]) for i in tr_ix), 1),
            voltage_pu=round(min(float(net.res_bus.vm_pu.at[i]) for i in lv_ix), 4),
        )
        for bid, bname, tr_ix, lv_ix in building_rows if tr_ix
    ]

    # 「最低電壓」列納入新增建物:若某棟新建物電壓比既有最低還低,更新供前後對比顯示
    if building_loadings:
        worst = min(building_loadings, key=lambda b: b.voltage_pu)
        if worst.voltage_pu < scenario.min_voltage_pu:
            scenario.min_voltage_pu = worst.voltage_pu
            scenario.min_voltage_building_id = worst.id
            scenario.min_voltage_building_name = worst.name

    # 把新增元件併入 scenario 結果,並重算全系統最大負載率(供前後對比顯示)
    scenario.transformer_loadings = list(scenario.transformer_loadings) + added_transformers
    scenario.feeder_loadings = list(scenario.feeder_loadings) + added_feeders
    scenario.max_transformer_load_ratio_percent = round(max(t.load_ratio_percent for t in scenario.transformer_loadings), 1)
    scenario.max_feeder_load_ratio_percent = round(max((f.load_ratio_percent for f in scenario.feeder_loadings), default=0.0), 1)

    return PlanSimulateResult(
        base=base_result, scenario=scenario,
        added_transformers=added_transformers, added_feeders=added_feeders,
        building_loadings=building_loadings, warnings=warnings,
    )
