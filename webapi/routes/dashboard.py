from fastapi import APIRouter, Depends

from webapi.deps import use_network
from webapi.schemas import DashboardSummary
from webapi.services import dashboard_service

router = APIRouter(prefix="/api/{network_id}/dashboard", tags=["dashboard"],
                   dependencies=[Depends(use_network)])


@router.get("", response_model=DashboardSummary)
def get_dashboard() -> DashboardSummary:
    return dashboard_service.get_summary()
