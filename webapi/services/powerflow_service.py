"""Power Flow Viewer:回傳 base 潮流結果 (已快取)。"""
from __future__ import annotations

from webapi import state
from webapi.schemas import PowerFlowResult


def get_power_flow() -> PowerFlowResult:
    return state.get_base_result()
