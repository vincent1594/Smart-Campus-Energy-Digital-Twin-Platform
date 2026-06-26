"""應用層級狀態 —— 多電網快取。

啟動時為每個已註冊電網 (南/北) 各建一次 base net + 跑潮流 + 解析 domain,全部快取且唯讀。
Scenario 一律 deepcopy(base.net) 後再改,base 永不被汙染。

getter 的 network_id 預設為 DEFAULT_NETWORK_ID (北),故既有的無參呼叫行為不變;
Phase 2 會由 route/service 帶入正確 network_id。
"""
from __future__ import annotations

from webapi.engine import BaseModel, build_base
from webapi.mappers.result_mapper import map_power_flow
from webapi.domain import CampusModel
from webapi.schemas import PowerFlowResult
from networks.registry import PROVIDERS, get_provider
from webapi.context import current_network

_bases: dict[str, BaseModel] = {}
_base_results: dict[str, PowerFlowResult] = {}


def init_state() -> None:
    """為所有已註冊電網建好 base 狀態與 base 潮流結果並快取。"""
    for nid, provider in PROVIDERS.items():
        base = build_base(provider)
        _bases[nid] = base
        _base_results[nid] = map_power_flow(base.model, base.net, base.index, base.results)


def _resolve(network_id: str | None) -> str:
    """未明確指定時,解析為當前請求情境的電網 (ContextVar,預設北)。"""
    return network_id if network_id is not None else current_network.get()


def _ensure(network_id: str | None = None) -> BaseModel:
    """取得 (必要時惰性建構) 指定/當前電網的 base 狀態。未知 id 由 get_provider 拋 KeyError。"""
    nid = _resolve(network_id)
    if nid not in _bases:
        _bases[nid] = build_base(get_provider(nid))
    return _bases[nid]


def get_base(network_id: str | None = None) -> BaseModel:
    return _ensure(network_id)


def get_base_model(network_id: str | None = None) -> CampusModel:
    return _ensure(network_id).model


def get_base_result(network_id: str | None = None) -> PowerFlowResult:
    nid = _resolve(network_id)
    if nid not in _base_results:
        base = _ensure(nid)
        _base_results[nid] = map_power_flow(base.model, base.net, base.index, base.results)
    return _base_results[nid]
