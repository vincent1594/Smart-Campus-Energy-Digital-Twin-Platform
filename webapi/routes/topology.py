from fastapi import APIRouter, Depends

from webapi.deps import use_network
from webapi.schemas import TopologyGraph
from webapi.services import topology_service

router = APIRouter(prefix="/api/{network_id}/topology", tags=["topology"],
                   dependencies=[Depends(use_network)])


@router.get("", response_model=TopologyGraph)
def get_topology() -> TopologyGraph:
    return topology_service.get_graph()
