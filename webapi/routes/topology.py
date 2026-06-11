from fastapi import APIRouter

from webapi.schemas import TopologyGraph
from webapi.services import topology_service

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("", response_model=TopologyGraph)
def get_topology() -> TopologyGraph:
    return topology_service.get_graph()
