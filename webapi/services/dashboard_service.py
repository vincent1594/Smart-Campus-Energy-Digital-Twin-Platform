"""Dashboard:9 個 KPI,全部取自 base model + 已快取的 base 潮流結果。"""
from __future__ import annotations

from webapi import state
from webapi.schemas import DashboardSummary

try:  # 負載基準(情境/時點)說明 —— 來自既有模型參數
    from data.parameters import ACTIVE_SCENARIO, SYSTEM_LOAD_TIMESTAMP, SYSTEM_PEAK_PERIOD
    _LOAD_BASIS = " · ".join(x for x in (ACTIVE_SCENARIO, SYSTEM_LOAD_TIMESTAMP, SYSTEM_PEAK_PERIOD) if x)
except Exception:  # pragma: no cover
    _LOAD_BASIS = ""


def get_summary() -> DashboardSummary:
    model = state.get_base_model()
    result = state.get_base_result()
    return DashboardSummary(
        building_count=len(model.buildings),
        transformer_count=len(model.transformers),
        feeder_count=len(model.feeders),
        vcb_count=len(model.vcbs),
        total_load_kw=result.total_load_kw,
        total_load_kvar=result.total_load_kvar,
        system_loss_kw=result.system_loss_kw,
        system_loss_kvar=result.system_loss_kvar,
        min_voltage_pu=result.min_voltage_pu,
        max_transformer_load_ratio_percent=result.max_transformer_load_ratio_percent,
        max_feeder_load_ratio_percent=result.max_feeder_load_ratio_percent,
        status=result.status,
        load_basis=_LOAD_BASIS,
    )
