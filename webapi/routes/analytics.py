"""訪客統計 API。

POST /api/visit         記一次拜訪(body: {visitor_id})→ 回最新統計
GET  /api/visit/stats   取目前統計(今日/累計 人數與次數 + 近 14 天)
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from webapi.schemas import RecentVisit, VisitStats
from webapi.services import analytics_service

router = APIRouter(prefix="/api/visit", tags=["analytics"])


class VisitIn(BaseModel):
    visitor_id: str = "anon"


def _client_ip(request: Request) -> str:
    # Render/代理後面:真實 IP 在 X-Forwarded-For 第一個;否則用直連 IP
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("", response_model=VisitStats)
def post_visit(body: VisitIn, request: Request) -> VisitStats:
    return analytics_service.record_visit(body.visitor_id, _client_ip(request))


@router.get("/stats", response_model=VisitStats)
def get_stats() -> VisitStats:
    return analytics_service.get_stats()


# 最近訪客(含 IP,個資)—— 前端僅在登入後才呼叫/顯示
@router.get("/recent", response_model=list[RecentVisit])
def get_recent(limit: int = 30) -> list[RecentVisit]:
    return analytics_service.get_recent(limit)
