"""歷史趨勢 API(EMS 實測時序聚合)。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from webapi.schemas import HistoryReport
from webapi.services import history_service

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=HistoryReport)
def get_history() -> HistoryReport:
    try:
        return history_service.get_history()
    except Exception as exc:  # noqa: BLE001 - EMS 讀取/聚合失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"歷史資料讀取失敗:{exc}") from exc
