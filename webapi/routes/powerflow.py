from fastapi import APIRouter

from webapi.schemas import PowerFlowResult
from webapi.services import powerflow_service

router = APIRouter(prefix="/api/powerflow", tags=["powerflow"])


@router.get("", response_model=PowerFlowResult)
def get_power_flow() -> PowerFlowResult:
    return powerflow_service.get_power_flow()
