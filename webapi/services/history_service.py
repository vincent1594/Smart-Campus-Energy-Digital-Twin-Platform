"""歷史趨勢 —— 由 EMS 實測逐時資料聚合(供營繕組看負載型態/尖峰)。

資料來源:EMS/11205-06(北).xlsx,2023/05–06 逐時各饋線 kW(11 條 VCB)。
僅 2 個月實測,屬「負載型態分析」(每日尖峰/平均、典型日曲線、各饋線占比),
非跨年成長趨勢(無多年資料)。
"""
from __future__ import annotations

from functools import lru_cache

from webapi import state
from webapi.schemas import (
    HistoryDaily,
    HistoryFeeder,
    HistoryHourProfile,
    HistoryReport,
)

_FEEDERS = [f"VCB{i}" for i in range(1, 12)]   # VCB12=電容,排除


@lru_cache(maxsize=1)
def _df():
    from data.ems_loads import _read_ems
    t = _read_ems().copy()
    t["total"] = t[_FEEDERS].sum(axis=1)
    return t


def get_history() -> HistoryReport:
    t = _df()
    total = t["total"]

    peak_i = total.idxmax()
    peak_time = str(t.loc[peak_i, "dt"])

    # 每日 平均/尖峰
    day = t.groupby(t["dt"].dt.date)["total"].agg(["mean", "max"]).reset_index()
    daily = [HistoryDaily(date=str(r["dt"]), avg_kw=round(float(r["mean"]), 1), peak_kw=round(float(r["max"]), 1))
             for _, r in day.iterrows()]

    # 典型日 24h(平日 vs 假日)
    hour = t["dt"].dt.hour
    is_weekend = t["dt"].dt.dayofweek >= 5
    wd = t[~is_weekend].groupby(hour[~is_weekend])["total"].mean()
    we = t[is_weekend].groupby(hour[is_weekend])["total"].mean()
    profile = [HistoryHourProfile(hour=h,
                                  weekday_kw=round(float(wd.get(h, 0.0)), 1),
                                  weekend_kw=round(float(we.get(h, 0.0)), 1))
               for h in range(24)]

    # 各饋線期間平均(降冪)
    model = state.get_base_model()
    feeders = []
    for c in _FEEDERS:
        v = model.vcb(c)
        feeders.append(HistoryFeeder(feeder=c, name=v.name if v else c, avg_kw=round(float(t[c].mean()), 1)))
    feeders.sort(key=lambda x: x.avg_kw, reverse=True)

    return HistoryReport(
        period_start=str(t["dt"].min().date()),
        period_end=str(t["dt"].max().date()),
        days=int(t["dt"].dt.date.nunique()),
        peak_kw=round(float(total.max()), 1),
        peak_time=peak_time,
        avg_kw=round(float(total.mean()), 1),
        total_kwh=round(float(total.sum()), 0),
        source="EMS 北電錶實測 2023/05–06 逐時(11 饋線);2 個月實測,屬負載型態分析,非跨年成長。",
        daily=daily, profile=profile, feeders=feeders,
    )
