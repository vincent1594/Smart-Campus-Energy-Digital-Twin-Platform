from fastapi import APIRouter, HTTPException

from webapi.powerflow import PowerFlowError
from webapi.schemas import ScenarioComparison, ScenarioRequest
from webapi.services import scenario_service

router = APIRouter(prefix="/api/scenario", tags=["scenario"])


@router.post("/run", response_model=ScenarioComparison)
def run_scenario(req: ScenarioRequest) -> ScenarioComparison:
    try:
        return scenario_service.run_scenario(req)
    except PowerFlowError as exc:
        # 潮流不收斂等 -> 回友善訊息,而非 500
        raise HTTPException(status_code=400, detail=str(exc)) from exc
