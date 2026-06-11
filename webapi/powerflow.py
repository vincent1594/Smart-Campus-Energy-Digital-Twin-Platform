"""潮流求解薄封裝 —— 在 (base 或 scenario 的) net 上跑潮流並翻譯成 DTO。

底層計算與結果擷取都委派給 repo 既有的 analysis/power_flow.py。
"""
from __future__ import annotations

from webapi.engine import NetIndex, run_power_flow
from webapi.mappers.result_mapper import map_power_flow
from webapi.domain import CampusModel
from webapi.schemas import PowerFlowResult


class PowerFlowError(Exception):
    """潮流計算失敗 (不收斂等)。由 API 層轉成友善訊息回前端。"""


def solve_net(model: CampusModel, net, index: NetIndex) -> PowerFlowResult:
    try:
        results = run_power_flow(net)
    except Exception as exc:  # noqa: BLE001 - 統一轉成業務錯誤
        raise PowerFlowError(
            f"潮流計算未收斂或失敗:{exc}。請檢查負載是否遠超容量。"
        ) from exc
    return map_power_flow(model, net, index, results)
