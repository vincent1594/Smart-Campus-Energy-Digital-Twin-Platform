"""訪客統計 API。

POST /api/visit         記一次拜訪(body: {visitor_id})→ 回最新統計
GET  /api/visit/stats   取目前統計(今日/累計 人數與次數 + 近 14 天)
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from webapi.schemas import VisitStats
from webapi.services import analytics_service

router = APIRouter(prefix="/api/visit", tags=["analytics"])


class VisitIn(BaseModel):
    visitor_id: str = "anon"


@router.post("", response_model=VisitStats)
def post_visit(body: VisitIn) -> VisitStats:
    return analytics_service.record_visit(body.visitor_id)


@router.get("/stats", response_model=VisitStats)
def get_stats() -> VisitStats:
    return analytics_service.get_stats()
