"""EUI 用電強度 (kWh/m²·年) —— 各棟 + 全校,供營繕組節能績效/能源局申報。

作法:
1. 全校年用電量:XGBoost 饋線模型預測整年逐時 kW,加總積分成 kWh (1h)。
2. 各棟年用電量:以各棟現況負載 (model.buildings.load_kw) 占比,把全校年用電量
   分配到各棟 (依 data/area_loads.LOAD_BUILDING 歸到建物字母)。
3. EUI = 各棟年用電量 / 該棟樓地板面積 (BUILDING_AREA)。

限制:各棟年能耗以「現況負載占比」近似 (各棟負載型態其實不同);全校總量隨
XGBoost 模型,無氣溫特徵,夏季可能略偏低。屬規劃/比較用,非計費實測。
"""
from __future__ import annotations

import re
from datetime import datetime

from webapi import state
from webapi.schemas import BuildingEUI, EUIReport

try:
    from data.area_loads import BUILDING_AREA, LOAD_BUILDING
except Exception:  # pragma: no cover
    BUILDING_AREA, LOAD_BUILDING = {}, {}

# 參考基準 (kWh/m²·年):全國大專校院約 80–130;此為顯示參考,請依能源署最新值校正。
EUI_BENCHMARK = 120.0

# 樓地板面積小於此值者,EUI 易受分母放大失真,標注「僅供參考」並排除於節能優先。
EUI_MIN_RELIABLE_AREA = 2000.0

_annual_cache: dict[int, float] = {}


def _annual_campus_kwh(year: int) -> float:
    """整年逐時預測各饋線 kW 加總 → 全校年用電量 kWh (1h 積分)。"""
    if year in _annual_cache:
        return _annual_cache[year]

    import calendar

    import joblib
    import pandas as pd

    from analysis.xgb_forecast import FEEDER_COLS, MODEL_FILE, _features, train_and_evaluate

    if not MODEL_FILE.exists():
        train_and_evaluate(save=True)
    models = joblib.load(MODEL_FILE)

    stamps = [pd.Timestamp(year=year, month=m, day=d, hour=h)
              for m in range(1, 13)
              for d in range(1, calendar.monthrange(year, m)[1] + 1)
              for h in range(24)]
    X = _features(pd.Series(stamps))
    total = 0.0
    for c in FEEDER_COLS:
        total += sum(max(0.0, float(v)) for v in models[c].predict(X))
    _annual_cache[year] = total
    return total


def _clean_name(name: str) -> str:
    return re.split(r"[（(]", name)[0].strip()


def get_eui(year: int | None = None) -> EUIReport:
    year = year or datetime.now().year
    campus_kwh = _annual_campus_kwh(year)

    model = state.get_base_model()
    # 依建物字母彙總負載與代表名稱
    letter_load: dict[str, float] = {}
    letter_name: dict[str, str] = {}
    for b in model.buildings:
        letter = LOAD_BUILDING.get(b.id)
        if not letter or letter not in BUILDING_AREA:
            continue
        letter_load[letter] = letter_load.get(letter, 0.0) + max(0.0, b.load_kw)  # 夾為≥0:負載(PV淨出力殘差)不減 EUI
        letter_name.setdefault(letter, _clean_name(b.name))

    total_load = sum(letter_load.values())
    total_area = sum(BUILDING_AREA[L] for L in letter_load)

    buildings: list[BuildingEUI] = []
    for letter, load in letter_load.items():
        area = BUILDING_AREA[letter]
        annual_kwh = campus_kwh * (load / total_load) if total_load else 0.0
        eui = annual_kwh / area if area else 0.0
        buildings.append(BuildingEUI(
            letter=letter, name=letter_name.get(letter, f"{letter}棟"),
            floor_area_m2=round(area, 1), load_kw=round(load, 1),
            annual_kwh=round(annual_kwh, 0), eui=round(eui, 1),
            area_reliable=area >= EUI_MIN_RELIABLE_AREA,
        ))
    buildings.sort(key=lambda x: x.eui, reverse=True)

    campus_eui = campus_kwh / total_area if total_area else 0.0
    return EUIReport(
        year=year,
        campus_eui=round(campus_eui, 1),
        campus_annual_kwh=round(campus_kwh, 0),
        total_floor_area_m2=round(total_area, 1),
        benchmark=EUI_BENCHMARK,
        buildings=buildings,
    )
