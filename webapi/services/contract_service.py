"""契約容量最佳化 (營繕組殺手功能)。

問題:台電「經常契約」基本電費按契約容量整年收;但需量一旦超過契約,
超約部分基本電費按 2 倍 (10% 以內) / 3 倍 (超過 10%) 加收。
契約訂太高 → 整年基本電費浪費;訂太低 → 夏季尖峰被 2/3 倍重罰。
最佳契約 = 使「基本電費 + 全年超約罰款」最小者。

資料現實:
- 尖峰錨點用 **EMS 實測**月最高需量 (北電錶 2023/05–06),非預測 —— 罰款數字零外推。
- XGBoost 饋線模型無氣溫/月份特徵,無法表現季節差異,故不用它推月尖峰;
  改以「高需量月數 high_months + 離峰季比例 offseason_ratio」當**可編輯假設**,
  由營繕組依自家全年型態填寫,平台只負責把假設換算成最佳契約與估省。
"""
from __future__ import annotations

import math

from webapi.demand_config import estimate_overshoot_penalty as _penalty
from webapi.schemas import (
    ContractCurvePoint,
    ContractOptimization,
    MeasuredMonthPeak,
)


def _measured_month_peaks() -> dict[str, float]:
    """EMS 實測:各月最高需量 (kW)。{'2023-05': 4185.1, '2023-06': 4220.1}。"""
    from webapi.services.history_service import _df

    t = _df()
    grp = t.groupby(t["dt"].dt.strftime("%Y-%m"))["total"].max()
    return {str(k): round(float(v), 1) for k, v in grp.items()}


def _annual_peaks(summer_peak: float, high_months: int, offseason_ratio: float) -> list[float]:
    """全年 12 個月的計費尖峰假設向量:high_months 個月貼夏季實測尖峰,其餘為離峰季。"""
    low = summer_peak * offseason_ratio
    return [summer_peak] * high_months + [low] * (12 - high_months)


def _annual_cost(contract: float, rate: float, peaks: list[float]) -> tuple[float, float]:
    """回傳 (基本電費, 全年超約罰款)。基本電費按契約整年 12 個月收。"""
    basic = contract * rate * 12.0
    penalty = sum(_penalty(contract, p, rate) for p in peaks)
    return basic, penalty


def optimize(
    contract_kw: float,
    rate: float,
    high_months: int,
    offseason_ratio: float,
) -> ContractOptimization:
    measured = _measured_month_peaks()
    summer_peak = max(measured.values()) if measured else contract_kw

    # 實測各月:純實測尖峰 + 對現況契約的單月超約罰款 (零外推)
    measured_rows = [
        MeasuredMonthPeak(
            month=m,
            peak_kw=pk,
            overshoot_kw=round(max(0.0, pk - contract_kw), 1),
            penalty_nt=round(_penalty(contract_kw, pk, rate), 0),
        )
        for m, pk in sorted(measured.items())
    ]

    peaks = _annual_peaks(summer_peak, high_months, offseason_ratio)

    # 掃契約容量:2500 → 夏季尖峰上方 5%,步進 25 kW,求年總成本最小
    lo = 2500.0
    hi = math.ceil(summer_peak * 1.05 / 25.0) * 25.0
    curve: list[ContractCurvePoint] = []
    best_c, best_total = contract_kw, math.inf
    c = lo
    while c <= hi + 1e-6:
        basic, pen = _annual_cost(c, rate, peaks)
        total = basic + pen
        curve.append(ContractCurvePoint(
            contract_kw=round(c, 0), basic_nt=round(basic, 0),
            penalty_nt=round(pen, 0), total_nt=round(total, 0),
        ))
        if total < best_total:
            best_total, best_c = total, c
        c += 25.0

    cur_basic, cur_pen = _annual_cost(contract_kw, rate, peaks)
    rec_basic, rec_pen = _annual_cost(best_c, rate, peaks)
    cur_total = cur_basic + cur_pen
    rec_total = rec_basic + rec_pen

    if best_c > contract_kw:
        action = f"建議調高契約至 {best_c:.0f} kW:夏季尖峰已破約,挨 2/3 倍罰款比補基本電費更貴。"
    elif best_c < contract_kw:
        action = f"建議調低契約至 {best_c:.0f} kW:現況契約高於全年尖峰需求,基本電費長年溢付。"
    else:
        action = "現況契約已接近最佳,無明顯調整空間。"

    note = (
        f"尖峰錨點 {summer_peak:.0f} kW 取自 EMS 實測月最高需量(2023/05–06),罰款為實測零外推;"
        f"全年成本以「高需量月數={high_months}、離峰季比例={offseason_ratio:.2f}」假設外推,"
        "請依自家全年型態調整。基本電費單價沿用需量分頁設定,未分夏月/非夏月。"
    )

    return ContractOptimization(
        rate_nt_per_kw=round(rate, 2),
        high_months=high_months,
        offseason_ratio=round(offseason_ratio, 2),
        summer_peak_kw=round(summer_peak, 1),
        measured=measured_rows,
        current_contract_kw=round(contract_kw, 1),
        current_annual_nt=round(cur_total, 0),
        current_penalty_nt=round(cur_pen, 0),
        recommended_contract_kw=round(best_c, 0),
        recommended_annual_nt=round(rec_total, 0),
        recommended_penalty_nt=round(rec_pen, 0),
        annual_savings_nt=round(cur_total - rec_total, 0),
        peakshave_savings_nt=round(cur_pen, 0),
        curve=curve,
        note=note,
    )
