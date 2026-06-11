"""Scenario Simulation —— 在 base net 的 deepcopy 上套修改後重算。

安全保證:base net / base 結果皆快取且唯讀;每次模擬都是 deepcopy 後改 clone,
request 之間無狀態、不互相汙染。

四種修改 (皆可選):
1. 單棟建築負載 kW (依該負載原 pf 同步調整無功)
2. 總負載 kW —— 依 base 各棟比例自動分配
3. 變壓器容量 kVA
4. 饋線長度 m
"""
from __future__ import annotations

import copy

from webapi import state
from webapi.powerflow import solve_net
from webapi.schemas import ScenarioComparison, ScenarioRequest


def run_scenario(req: ScenarioRequest) -> ScenarioComparison:
    base = state.get_base()
    base_result = state.get_base_result()      # 快取,不重算
    net = copy.deepcopy(base.net)              # ★ 動的是 clone,base net 不變
    index = base.index
    model = base.model

    # 1) 總負載:依各棟比例縮放 (P、Q 同比例,維持 pf)
    if req.total_load_kw is not None:
        base_total_kw = float(net.load["p_mw"].sum()) * 1000.0
        if base_total_kw > 0:
            scale = req.total_load_kw / base_total_kw
            net.load["p_mw"] = net.load["p_mw"] * scale
            net.load["q_mvar"] = net.load["q_mvar"] * scale

    # 2) 單棟負載覆寫 (在比例分配之後)
    if req.building_loads:
        for o in req.building_loads:
            li = index.load_by_name.get(o.building_id)
            if li is None:
                continue
            p_old = float(net.load.at[li, "p_mw"])
            q_old = float(net.load.at[li, "q_mvar"])
            q_over_p = (q_old / p_old) if p_old > 0 else 0.0
            p_new = o.load_kw / 1000.0
            net.load.at[li, "p_mw"] = p_new
            net.load.at[li, "q_mvar"] = p_new * q_over_p

    # 3) 變壓器容量
    if req.transformer_capacities:
        for tid, kva in req.transformer_capacities.items():
            ti = index.trafo_by_name.get(tid)
            if ti is not None:
                net.trafo.at[ti, "sn_mva"] = kva / 1000.0

    # 4) 饋線長度
    if req.feeder_lengths:
        for fid, length_m in req.feeder_lengths.items():
            f = model.feeder(fid)
            line_name = f.line_name if f else fid
            ki = index.line_by_name.get(line_name)
            if ki is not None:
                net.line.at[ki, "length_km"] = length_m / 1000.0

    scenario_result = solve_net(model, net, index)
    return ScenarioComparison(base=base_result, scenario=scenario_result)
