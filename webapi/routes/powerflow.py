from fastapi import APIRouter, Depends

from webapi.deps import use_network
from webapi.schemas import PowerFlowResult
from webapi.services import powerflow_service

router = APIRouter(prefix="/api/{network_id}/powerflow", tags=["powerflow"],
                   dependencies=[Depends(use_network)])


@router.get("", response_model=PowerFlowResult)
def get_power_flow() -> PowerFlowResult:
    return powerflow_service.get_power_flow()
