"""需量 / 契約容量 服務 (營繕組)。

兩個能力:
1. 現況需量狀態 —— 取 base 潮流的市電進線實功率 (grid_import_kw) 對比契約容量。
2. 逐時需量預測 —— 用既有 XGBoost 饋線模型預測某日 0~23 時各饋線 kW,
   加總為該時市電需量,找尖峰 → 評估超約罰款 → 給卸載建議。

XGBoost 預測 (各饋線 kW) 即受電站各出線需量,加總約等於台電進線需量;
故直接以「各饋線預測 kW 之和」作為該時刻需量估計 (損耗佔比極小)。
重 (CPU) 的只有預測,故依日期快取;契約/費率變動只重算便宜的計費數學。

⚠ 需量口徑限制 (論文須揭露): 原始電錶資料即為逐時,尖峰取自每日 24 個整點的
逐時平均值。台電契約容量實以 **15 分鐘** 需量計費,逐時平均會削平區間內的峰值 →
peak_kw 系統性低估真實 15 分鐘尖峰,連帶 overshoot_kw / penalty_nt 偏低 (保守)。
無 15 分鐘原始資料可修正,故本模組所有超約金額應理解為「下界估計」。

⚠ 另註: get_status() 的 current_demand_kw 取自潮流 base.grid_import_kw (含損耗),
與 get_forecast() 的「饋線預測加總」(不含損耗) 為不同口徑,兩者不宜直接相減比較。
"""
from __future__ import annotations

from webapi import state
from webapi.demand_config import (
    CONTRACT_CAPACITY_KW,
    DEMAND_CHARGE_NT_PER_KW,
    demand_status,
    estimate_overshoot_penalty,
)
from webapi.schemas import (
    DemandForecast,
    DemandStatus,
    FeederDemand,
    HourlyDemand,
    ShedSuggestion,
)

# 逐日預測快取:date -> list[ {VCBx: kw} ] (長度 24)
_pred_cache: dict[str, list[dict]] = {}


def get_status(
    contract_kw: float = CONTRACT_CAPACITY_KW,
    rate: float = DEMAND_CHARGE_NT_PER_KW,
) -> DemandStatus:
    base = state.get_base_result()
    demand = base.grid_import_kw
    util = (demand / contract_kw * 100.0) if contract_kw > 0 else 0.0
    try:
        from networks.north.data.parameters import SYSTEM_PEAK_PERIOD
        basis = f"現況模型快照 · {SYSTEM_PEAK_PERIOD}"
    except Exception:  # noqa: BLE001
        basis = "現況模型快照"
    return DemandStatus(
        current_demand_kw=round(demand, 1),
        contract_capacity_kw=round(contract_kw, 1),
        demand_charge_nt_per_kw=round(rate, 2),
        utilization_percent=round(util, 1),
        headroom_kw=round(contract_kw - demand, 1),
        status=demand_status(util),
        load_basis=basis,
    )


def _predict_day(date: str) -> list[dict]:
    """預測該日 24 個整點各饋線 kW。

    用 lag(近期實際負載)模型 → 逐日/逐週不同;缺 lag 的時段自動退回行事曆模型。
    """
    from networks.north.analysis.xgb_forecast import predict_day_feeders
    return predict_day_feeders(date, lag=True)


def _actual_day(date: str) -> list[float | None]:
    """該日 0-23 時 EMS 實測總量 (Σ VCB1~11,與預測同口徑);無實測的時段為 None。"""
    import pandas as pd

    from networks.north.analysis.xgb_forecast import FEEDER_COLS
    from networks.north.data.ems_loads import _read_ems

    t = _read_ems()
    day = t[t["dt"].dt.strftime("%Y-%m-%d") == date]
    by_hour = {int(r["dt"].hour): sum(float(r[c]) for c in FEEDER_COLS)
               for _, r in day.iterrows()}
    return [round(by_hour[h], 1) if h in by_hour else None for h in range(24)]


def get_forecast(
    date: str,
    contract_kw: float = CONTRACT_CAPACITY_KW,
    rate: float = DEMAND_CHARGE_NT_PER_KW,
) -> DemandForecast:
    rows = _pred_cache.get(date)
    if rows is None:
        rows = _predict_day(date)
        _pred_cache[date] = rows

    model = state.get_base_model()

    def _name(vcb_id: str) -> str:
        v = model.vcb(vcb_id)
        return v.name if v else vcb_id

    def _feeders(row: dict) -> list[FeederDemand]:
        """某時刻各饋線需量 (降冪,去零),供逐時/尖峰查詢。"""
        return [
            FeederDemand(feeder_id=vid, feeder_name=_name(vid), demand_kw=round(kw, 1))
            for vid, kw in sorted(row.items(), key=lambda kv: kv[1], reverse=True)
            if kw > 0
        ]

    actual = _actual_day(date)            # EMS 實測 (資料期內才有),供預測 vs 實際
    hourly = [
        HourlyDemand(hour=h, demand_kw=round(sum(rows[h].values()), 1),
                     actual_kw=actual[h], feeders=_feeders(rows[h]))
        for h in range(24)
    ]
    # 當日逐時準度 (僅就有實測的小時計算)
    pairs = [(sum(rows[h].values()), actual[h]) for h in range(24) if actual[h] is not None]
    actual_peak_kw = round(max((a for _, a in pairs), default=0.0), 1) if pairs else None
    mae_kw = round(sum(abs(p - a) for p, a in pairs) / len(pairs), 1) if pairs else None
    mape_pct = (round(sum(abs(p - a) / a for p, a in pairs if a) / len(pairs) * 100, 1)
                if pairs else None)

    peak_hour = max(range(24), key=lambda h: sum(rows[h].values()))
    peak_row = rows[peak_hour]
    peak_kw = round(sum(peak_row.values()), 1)

    overshoot = max(0.0, peak_kw - contract_kw)
    penalty = estimate_overshoot_penalty(contract_kw, peak_kw, rate)
    util = (peak_kw / contract_kw * 100.0) if contract_kw > 0 else 0.0

    peak_feeders = _feeders(peak_row)     # 尖峰各饋線需量 (降冪)

    # 卸載建議:由最大饋線起,累計到足以回到契約容量內
    shed: list[ShedSuggestion] = []
    if overshoot > 0:
        cum = 0.0
        for f in peak_feeders:
            cum += f.demand_kw
            shed.append(ShedSuggestion(
                feeder_id=f.feeder_id, feeder_name=f.feeder_name,
                shed_kw=f.demand_kw, cumulative_kw=round(cum, 1),
            ))
            if cum >= overshoot:
                break

    return DemandForecast(
        date=date,
        contract_capacity_kw=round(contract_kw, 1),
        demand_charge_nt_per_kw=round(rate, 2),
        hourly=hourly,
        peak_kw=peak_kw,
        peak_hour=peak_hour,
        overshoot_kw=round(overshoot, 1),
        penalty_nt=round(penalty, 0),
        status=demand_status(util),
        peak_feeders=peak_feeders,
        shed_suggestions=shed,
        actual_peak_kw=actual_peak_kw,
        mae_kw=mae_kw,
        mape_pct=mape_pct,
    )
