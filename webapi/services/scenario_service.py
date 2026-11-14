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

import networks.north.models.network_builder as _nb  # type: ignore

from webapi import state
from webapi.engine import _build_index
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


# ---------- 依時間點 XGBoost 預測並模擬 ----------
_forecast_cache: dict[str, object] = {}  # "timestamp|pv" -> scenario PowerFlowResult


def _build_net_at(timestamp: str, pv_factor: float):
    """暫時覆寫 builder 常數,以 XGBoost 預測該時刻負載建一個 net,再還原(base 不受影響)。"""
    saved = (_nb.SYSTEM_LOAD_METHOD, _nb.SYSTEM_LOAD_TIMESTAMP, _nb.SYSTEM_PV_FACTOR, _nb.SYSTEM_COINCIDENT_PEAK_KW)
    try:
        _nb.SYSTEM_LOAD_METHOD = "xgboost"          # 直接預測各饋線實際負載
        _nb.SYSTEM_LOAD_TIMESTAMP = timestamp
        _nb.SYSTEM_PV_FACTOR = pv_factor
        _nb.SYSTEM_COINCIDENT_PEAK_KW = None
        return _nb.build_network_s1_baseline()
    finally:
        (_nb.SYSTEM_LOAD_METHOD, _nb.SYSTEM_LOAD_TIMESTAMP,
         _nb.SYSTEM_PV_FACTOR, _nb.SYSTEM_COINCIDENT_PEAK_KW) = saved


def run_forecast(timestamp: str, pv_factor: float = 0.8) -> ScenarioComparison:
    base = state.get_base()
    base_result = state.get_base_result()
    ck = f"{timestamp}|{pv_factor}"
    if ck not in _forecast_cache:
        net = _build_net_at(timestamp, pv_factor)
        _forecast_cache[ck] = solve_net(base.model, net, _build_index(net))
    return ScenarioComparison(base=base_result, scenario=_forecast_cache[ck])  # type: ignore[arg-type]


def _peak_day_date() -> str:
    """EMS 全期(各饋線實測)總負載最高的那一天 → 'YYYY-MM-DD'。"""
    import pandas as _pd
    import networks.north.data.ems_loads as _e
    t = _e.read_feeder_ems_all().copy()
    fc = [f"VCB{i}" for i in range(1, 12)]            # 排除 VCB12 電容
    t["__tot"] = t[fc].sum(axis=1)
    return _pd.Timestamp(t.loc[t["__tot"].idxmax(), "dt"]).strftime("%Y-%m-%d")


def _build_net_ems(timestamp: str, pv_factor: float = 0.0):
    """暫時覆寫 builder 常數 → 以 EMS 該時刻實測建 net,再還原。pv_factor=0:直接用實測淨值。"""
    saved = (_nb.SYSTEM_LOAD_METHOD, _nb.SYSTEM_LOAD_TIMESTAMP, _nb.SYSTEM_PV_FACTOR, _nb.SYSTEM_COINCIDENT_PEAK_KW)
    try:
        _nb.SYSTEM_LOAD_METHOD = "ems"
        _nb.SYSTEM_LOAD_TIMESTAMP = timestamp
        _nb.SYSTEM_PV_FACTOR = pv_factor
        _nb.SYSTEM_COINCIDENT_PEAK_KW = None
        return _nb.build_network_s1_baseline()
    finally:
        (_nb.SYSTEM_LOAD_METHOD, _nb.SYSTEM_LOAD_TIMESTAMP, _nb.SYSTEM_PV_FACTOR, _nb.SYSTEM_COINCIDENT_PEAK_KW) = saved


def run_forecast_day(date: str | None = None, pv_factor: float | None = None) -> dict:
    """校園總攬日曲線:預設取「歷史尖峰最高日」(EMS 全期總負載最高那天)的 24h 實測重算。
    回傳 {date, peak_hour, snapshots};pv_factor 未指定時 = 0(用實測淨值)。"""
    from networks.north.data.ems_loads import compute_ems_loads
    date = date or _peak_day_date()
    pvf = 0.0 if pv_factor is None else pv_factor
    base = state.get_base()
    idx = base.index
    snaps = []
    for h in range(24):
        ck = f"emsday|{date}|{h}|{pvf}"
        if ck not in _forecast_cache:
            # 不重建網路:deepcopy base net,只改各負載點 kW(EMS 該時刻),再解潮流 → 快很多
            loads = compute_ems_loads(f"{date} {h:02d}:00", pvf)   # {load_name: kw}
            net = copy.deepcopy(base.net)
            for ln, kw in loads.items():
                li = idx.load_by_name.get(ln)
                if li is None:
                    continue
                p_old = float(net.load.at[li, "p_mw"])
                q_old = float(net.load.at[li, "q_mvar"])
                qp = (q_old / p_old) if p_old > 0 else 0.0
                p_new = max(0.0, kw) / 1000.0
                net.load.at[li, "p_mw"] = p_new
                net.load.at[li, "q_mvar"] = p_new * qp
            _forecast_cache[ck] = solve_net(base.model, net, idx)
        snaps.append(_forecast_cache[ck])
    peak_hour = max(range(24), key=lambda h: getattr(snaps[h], "total_load_kw", 0.0))
    return {"date": date, "peak_hour": peak_hour, "snapshots": snaps}
