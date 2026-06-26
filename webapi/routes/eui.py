"""EUI 用電強度 API (營繕組節能)。"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from webapi.deps import require_capability
from webapi.schemas import EUIReport
from webapi.services import eui_service

router = APIRouter(prefix="/api/{network_id}/eui", tags=["eui"],
                   dependencies=[Depends(require_capability("eui"))])


@router.get("", response_model=EUIReport)
def get_eui(year: Optional[int] = Query(None, description="計算年份,預設今年")) -> EUIReport:
    try:
        return eui_service.get_eui(year)
    except Exception as exc:  # noqa: BLE001 - 預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"EUI 計算失敗:{exc}") from exc
