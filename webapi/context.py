"""請求情境 —— 當前電網 id。

以 ContextVar 承載每個請求選定的 network_id,讓 state.get_base*() 等無參呼叫
自動解析到正確電網,免去把 network_id 穿過所有 service 方法簽名。

FastAPI 同步 handler 在 threadpool 執行,Starlette/anyio 會把 ContextVar 隨情境
複製到工作執行緒,故在 dependency 內 set() 後,handler 與其呼叫的 service 皆讀得到。
"""
from __future__ import annotations

from contextvars import ContextVar

from networks.registry import DEFAULT_NETWORK_ID

# 預設北 (沿用既有平台行為);背景預熱、CLI 等無請求情境時亦得此預設
current_network: ContextVar[str] = ContextVar("current_network", default=DEFAULT_NETWORK_ID)
