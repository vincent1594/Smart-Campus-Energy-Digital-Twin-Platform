"""網路註冊表 —— 單一後端的多電網入口。

每個 provider 露出 NETWORK_ID / DISPLAY_NAME / FEEDERS / build_net() / run_power_flow()。
webapi 透過 network_id 取得對應 provider;新增電網只需在此註冊。
"""
from __future__ import annotations

from networks.north import provider as north_provider
from networks.south import provider as south_provider

# 顯示順序即前端切換器順序 (北在前,沿用既有平台預設)
_PROVIDERS = [north_provider, south_provider]

PROVIDERS = {p.NETWORK_ID: p for p in _PROVIDERS}

DEFAULT_NETWORK_ID = north_provider.NETWORK_ID


def get_provider(network_id: str):
    """取得指定電網的 provider;未知 id 拋 KeyError (由 route 層轉 404)。"""
    return PROVIDERS[network_id]


def list_networks() -> list[dict]:
    """供前端切換器使用的電網清單。"""
    return [{"id": p.NETWORK_ID, "name": p.DISPLAY_NAME} for p in _PROVIDERS]
