"""需量 / 契約容量 API (營繕組)。

GET /api/demand                     現況需量 vs 契約 (預設契約/費率取 demand_config)
GET /api/demand/forecast?date=...   某日逐時需量預測 + 超約評估 + 卸載建議

contract_kw / rate 可由 query 覆寫,讓營繕組以自家合約數字試算 (不改後端設定)。
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from webapi.demand_config import CONTRACT_CAPACITY_KW, DEMAND_CHARGE_NT_PER_KW, WINDOW_NOTE
from webapi.schemas import BillRequest, DemandForecast, DemandStatus, MonthlyBill, TariffInfo
from webapi.services import bill_service, demand_service

router = APIRouter(prefix="/api/demand", tags=["demand"])


@router.get("/", response_model=DemandStatus)
def get_demand(
    contract_kw: float = Query(CONTRACT_CAPACITY_KW, gt=0),
    rate: float = Query(DEMAND_CHARGE_NT_PER_KW, ge=0),
) -> DemandStatus:
    return demand_service.get_status(contract_kw, rate)


@router.get("/forecast", response_model=DemandForecast)
def get_demand_forecast(
    date: str = Query(..., description="YYYY-MM-DD"),
    contract_kw: float = Query(CONTRACT_CAPACITY_KW, gt=0),
    rate: float = Query(DEMAND_CHARGE_NT_PER_KW, ge=0),
) -> DemandForecast:
    try:
        return demand_service.get_forecast(date, contract_kw, rate)
    except Exception as exc:  # noqa: BLE001 - 日期格式/預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"需量預測失敗:{exc}") from exc


@router.get("/tariff", response_model=TariffInfo)
def get_tariff() -> TariffInfo:
    """時間電價預設費率 + 時段窗格說明 (供前端預填可編輯表單)。"""
    return TariffInfo(rates=bill_service.default_rates(), window_note=WINDOW_NOTE)


@router.post("/bill", response_model=MonthlyBill)
def post_bill(req: BillRequest) -> MonthlyBill:
    """時間電價 月電費試算。"""
    try:
        return bill_service.compute_bill(req.month, req.contract_capacity_kw, req.rates)
    except Exception as exc:  # noqa: BLE001 - 月份格式/預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"電費試算失敗:{exc}") from exc
