"""FastAPI 相依 —— 多電網路由的共用關卡。

use_network          : 驗證路徑上的 {network_id} 並寫入 ContextVar (網路相關 router 都掛這個)。
require_capability(f): 在 use_network 之上再檢查該網是否提供功能 f;未提供回 404 友善訊息
                       (南網初期僅開拓樸/潮流/資產/建物/情境,需量/EUI/歷史/預測等降級)。
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Path

from networks.registry import PROVIDERS, get_provider
from webapi.context import current_network


async def use_network(network_id: str = Path(..., description="電網 id (north | south)")) -> str:
    # 必須是 async dependency:在事件迴圈 task 情境內 set,才會隨 context 複製到
    # endpoint 的 threadpool 執行緒;若為 sync dependency,set 於另一個 threadpool
    # 情境內,對 endpoint 不可見 (會退回預設網,造成跨網污染)。
    if network_id not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"未知電網:{network_id}")
    current_network.set(network_id)
    return network_id


def require_capability(feature: str):
    """產生一個檢查指定功能的 dependency (內含 use_network,故會先驗證+設定情境)。"""

    async def _dep(network_id: str = Depends(use_network)) -> str:
        prov = get_provider(network_id)
        caps = getattr(prov, "CAPABILITIES", set())
        if feature not in caps:
            name = getattr(prov, "DISPLAY_NAME", network_id)
            raise HTTPException(
                status_code=404,
                detail=f"{name} 尚未提供「{feature}」功能(資料未備)",
            )
        return network_id

    return _dep
