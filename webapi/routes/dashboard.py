from fastapi import APIRouter

from webapi.schemas import DashboardSummary
from webapi.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
def get_dashboard() -> DashboardSummary:
    return dashboard_service.get_summary()
