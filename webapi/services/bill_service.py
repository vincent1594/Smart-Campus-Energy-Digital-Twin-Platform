"""時間電價 月電費試算 (營繕組)。

流程:
1. 用 XGBoost 饋線模型,逐日逐時預測整月各饋線 kW,加總為該時市電需量。
2. 依台電高壓三段式時段窗格,把每小時歸到 尖峰/半尖峰/離峰,積分成各時段度數 kWh。
3. 流動電費 = Σ 各時段 kWh × 該時段費率;基本電費 = 契約容量 × 基本電費單價;
   超約罰款 = 全月最高需量超出契約部分 (2/3 倍級距)。月電費 = 三者相加。

限制:逐時 kW 以 1 小時積分為 kWh (台電以 15 分鐘需量計;此為規劃估算);
未計國定假日 (僅週日視為離峰日);超約簡化為單一經常契約 vs 全月最高需量。
"""
from __future__ import annotations

import calendar

from webapi.demand_config import (
    DEFAULT_TARIFF,
    MID,
    OFF,
    PEAK,
    WINDOW_NOTE,
    classify_period,
    estimate_overshoot_penalty,
    is_summer,
)
from webapi.schemas import BillPeriodLine, MonthlyBill, TariffRates

# 整月預測快取:"YYYY-MM" -> list[(weekday, hour, total_kw)]
_month_cache: dict[str, list[tuple[int, int, float]]] = {}


def default_rates() -> TariffRates:
    s, ns = DEFAULT_TARIFF["summer"], DEFAULT_TARIFF["nonsummer"]
    return TariffRates(
        summer_peak_kwh=s[PEAK], summer_midpeak_kwh=s[MID], summer_offpeak_kwh=s[OFF],
        nonsummer_midpeak_kwh=ns[MID], nonsummer_offpeak_kwh=ns[OFF],
        basic_summer_kw=s["basic"], basic_nonsummer_kw=ns["basic"],
    )


def _predict_month(month: str) -> list[tuple[int, int, float]]:
    """整月逐時預測:回傳 [(weekday, hour, total_kw)],一次載入模型批次預測。"""
    import joblib
    import pandas as pd

    from analysis.xgb_forecast import FEEDER_COLS, MODEL_FILE, _features, train_and_evaluate

    year, mon = (int(x) for x in month.split("-")[:2])
    days = calendar.monthrange(year, mon)[1]
    stamps = [pd.Timestamp(year=year, month=mon, day=d, hour=h)
              for d in range(1, days + 1) for h in range(24)]
    ts = pd.Series(stamps)

    if not MODEL_FILE.exists():
        train_and_evaluate(save=True)
    models = joblib.load(MODEL_FILE)
    X = _features(ts)
    feeder_pred = {c: models[c].predict(X) for c in FEEDER_COLS}
    total = [sum(max(0.0, float(feeder_pred[c][i])) for c in FEEDER_COLS) for i in range(len(stamps))]
    return [(stamps[i].weekday(), stamps[i].hour, total[i]) for i in range(len(stamps))]


def compute_bill(month: str, contract_kw: float, rates: TariffRates | None = None) -> MonthlyBill:
    rates = rates or default_rates()
    mon = int(month.split("-")[1])
    summer = is_summer(mon)

    rows = _month_cache.get(month)
    if rows is None:
        rows = _predict_month(month)
        _month_cache[month] = rows

    # 費率對照 (依季別)
    if summer:
        rate_of = {PEAK: rates.summer_peak_kwh, MID: rates.summer_midpeak_kwh, OFF: rates.summer_offpeak_kwh}
        basic_rate = rates.basic_summer_kw
    else:
        rate_of = {MID: rates.nonsummer_midpeak_kwh, OFF: rates.nonsummer_offpeak_kwh}
        basic_rate = rates.basic_nonsummer_kw

    kwh = {PEAK: 0.0, MID: 0.0, OFF: 0.0}
    peak_kw = {PEAK: 0.0, MID: 0.0, OFF: 0.0}
    for weekday, hour, kw in rows:
        p = classify_period(mon, weekday, hour)
        kwh[p] += kw                       # 1 小時積分 → kWh
        if kw > peak_kw[p]:
            peak_kw[p] = kw

    # 各時段流動電費 (只列該季存在且有度數的時段,固定 尖峰→半尖峰→離峰 順序)
    energy_lines: list[BillPeriodLine] = []
    for p in (PEAK, MID, OFF):
        if p not in rate_of or kwh[p] <= 0:
            continue
        energy_lines.append(BillPeriodLine(
            period=p, kwh=round(kwh[p], 0), rate=rate_of[p],
            charge=round(kwh[p] * rate_of[p], 0), peak_kw=round(peak_kw[p], 1),
        ))

    energy_charge = round(sum(l.charge for l in energy_lines), 0)
    basic_charge = round(contract_kw * basic_rate, 0)
    month_peak = round(max(peak_kw.values()), 1)
    overshoot = max(0.0, month_peak - contract_kw)
    penalty = round(estimate_overshoot_penalty(contract_kw, month_peak, basic_rate), 0)
    total = round(energy_charge + basic_charge + penalty, 0)

    return MonthlyBill(
        month=month, season="夏月" if summer else "非夏月",
        contract_capacity_kw=round(contract_kw, 1),
        energy_lines=energy_lines, energy_charge=energy_charge,
        basic_rate=basic_rate, basic_charge=basic_charge,
        peak_kw=month_peak, overshoot_kw=round(overshoot, 1), overshoot_penalty=penalty,
        total=total, window_note=WINDOW_NOTE,
    )
