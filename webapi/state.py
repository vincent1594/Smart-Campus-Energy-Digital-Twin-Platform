"""應用層級單例狀態。

啟動時用既有真實模型建一次 base net + 跑潮流 + 解析 domain,全部快取且唯讀。
Scenario 一律 deepcopy(base_net) 後再改,base 永不被汙染。
"""
from __future__ import annotations

from typing import Optional

from webapi.engine import BaseModel, build_base
from webapi.mappers.result_mapper import map_power_flow
from webapi.domain import CampusModel
from webapi.schemas import PowerFlowResult

_base: Optional[BaseModel] = None
_base_result: Optional[PowerFlowResult] = None


def init_state() -> None:
    global _base, _base_result
    _base = build_base()
    _base_result = map_power_flow(_base.model, _base.net, _base.index, _base.results)


def _ensure() -> BaseModel:
    if _base is None:
        init_state()
    return _base  # type: ignore[return-value]


def get_base() -> BaseModel:
    return _ensure()


def get_base_model() -> CampusModel:
    return _ensure().model


def get_base_result() -> PowerFlowResult:
    if _base_result is None:
        init_state()
    return _base_result  # type: ignore[return-value]
