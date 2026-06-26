from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from webapi.deps import use_network
from webapi.schemas import BuildingDetail, BuildingSummary
from webapi.services import building_service

router = APIRouter(prefix="/api/{network_id}/buildings", tags=["buildings"],
                   dependencies=[Depends(use_network)])


@router.get("", response_model=list[BuildingSummary])
def list_buildings(query: Optional[str] = Query(default=None, description="建築名稱或編號關鍵字")):
    return building_service.list_buildings(query)


@router.get("/{building_id}", response_model=BuildingDetail)
def get_building(building_id: str):
    detail = building_service.get_building(building_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"查無建築:{building_id}")
    return detail
