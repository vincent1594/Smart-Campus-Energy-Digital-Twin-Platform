from fastapi import APIRouter, Depends, HTTPException

from webapi.deps import require_capability, use_network
from webapi.powerflow import PowerFlowError
from webapi.schemas import ForecastRequest, PlanSimulateRequest, PlanSimulateResult, PowerFlowResult, ScenarioComparison, ScenarioRequest
from webapi.services import plan_service, scenario_service

router = APIRouter(prefix="/api/{network_id}/scenario", tags=["scenario"],
                   dependencies=[Depends(use_network)])

# 預測類端點需 forecast 功能 (依賴 EMS/XGB);南網未備 → 回 404 友善訊息
_forecast_dep = [Depends(require_capability("forecast"))]


@router.post("/run", response_model=ScenarioComparison)
def run_scenario(req: ScenarioRequest) -> ScenarioComparison:
    try:
        return scenario_service.run_scenario(req)
    except PowerFlowError as exc:
        # 潮流不收斂等 -> 回友善訊息,而非 500
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# 規劃模擬「加入模擬」:把使用者在地圖擺的規劃建物疊入模型跑潮流 + 額定護欄
@router.post("/plan-simulate", response_model=PlanSimulateResult)
def plan_simulate(req: PlanSimulateRequest) -> PlanSimulateResult:
    try:
        return plan_service.simulate_plan(req)
    except PowerFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# 模擬時間點:XGBoost 預測該時刻負載 → 與現況前後比較
@router.post("/forecast", response_model=ScenarioComparison, dependencies=_forecast_dep)
def run_forecast(req: ForecastRequest) -> ScenarioComparison:
    try:
        return scenario_service.run_forecast(req.timestamp, req.pv_factor)
    except PowerFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - 時間格式/預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"預測失敗:{exc}") from exc


# 校園總攬日曲線:歷史尖峰最高日 24h 實測快照,回傳 {date, peak_hour, snapshots},前端拖曳即時切換面板
@router.get("/forecast-day", dependencies=_forecast_dep)
def forecast_day(date: str | None = None, pv_factor: float | None = None) -> dict:
    try:
        return scenario_service.run_forecast_day(date, pv_factor)
    except PowerFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - 預測失敗轉友善訊息
        raise HTTPException(status_code=400, detail=f"當日預測失敗:{exc}") from exc
