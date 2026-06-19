"""使用者回饋 API。

POST /api/feedback        送出/更新回饋(body: {visitor_id, rating, comment, role})→ 回平均/則數
GET  /api/feedback/mine   取自己的回饋(?visitor_id=)→ 預填表單;無則回 null
GET  /api/feedback        明細列表(含留言/IP,個資)—— 前端僅登入後呼叫/顯示
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request

from webapi.schemas import FeedbackIn, FeedbackList, FeedbackResult, MyFeedback
from webapi.services import feedback_service

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("", response_model=FeedbackResult)
def post_feedback(body: FeedbackIn, request: Request) -> FeedbackResult:
    return feedback_service.submit(body.visitor_id, body.rating, body.comment, body.role, _client_ip(request))


@router.get("/mine", response_model=Optional[MyFeedback])
def get_mine(visitor_id: str = "") -> Optional[MyFeedback]:
    return feedback_service.get_mine(visitor_id)


@router.get("", response_model=FeedbackList)
def get_list(limit: int = 100) -> FeedbackList:
    return feedback_service.get_list(limit)
