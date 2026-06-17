from fastapi import APIRouter, HTTPException

from webapi.powerflow import PowerFlowError
from webapi.schemas import ForecastRequest, ScenarioComparison, ScenarioRequest
from webapi.services import scenario_service

router = APIRouter(prefix="/api/scenario", tags=["scenario"])


@router.post("/run", response_model=ScenarioComparison)
def run_scenario(req: ScenarioRequest) -> ScenarioComparison:
    try:
        return scenario_service.run_scenario(req)
    except PowerFlowError as exc:
        # 潮流不收斂等 -> 回友善訊息,而非 500
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# 模擬時間點:XGBoost 預測該時刻負載 → 與現況前後比較
@router.post("/forecast", response_model=ScenarioComparison)
def run_forecast(req: ForecastRequest) -> ScenarioComparison:
    try:
        return scenario_service.run_forecast(req.timestamp, req.pv_factor)
    except PowerFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - 時間格式/預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"預測失敗:{exc}") from exc
