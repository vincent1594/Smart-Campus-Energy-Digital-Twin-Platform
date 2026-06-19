"""使用者回饋 —— 星等 + 留言 + 選填身分。

一人(visitor_id)一則、可更新(upsert);儲存走 webapi/db(Postgres / SQLite)。
留言/IP 屬個資,僅登入管理者可看明細(前端 gating)。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from webapi.db import engine, feedback
from webapi.schemas import FeedbackItem, FeedbackList, FeedbackResult, MyFeedback

TW = timezone(timedelta(hours=8))   # 台灣時間(Render 跑 UTC)


def _now() -> str:
    return datetime.now(TW).strftime("%Y-%m-%dT%H:%M:%S")


def submit(visitor_id: str, rating: int, comment: str = "", role: str = "", ip: str = "") -> FeedbackResult:
    visitor_id = (visitor_id or "anon").strip()[:64]
    rating = max(1, min(5, int(rating)))
    comment = (comment or "").strip()[:1000] or None
    role = (role or "").strip()[:32] or None
    now = _now()
    with engine.begin() as c:
        res = c.execute(feedback.update().where(feedback.c.visitor_id == visitor_id).values(
            rating=rating, comment=comment, role=role, ip=(ip or "")[:64] or None, updated_at=now))
        if res.rowcount == 0:   # 方言無關 upsert:更新不到才插入
            c.execute(feedback.insert().values(
                visitor_id=visitor_id, rating=rating, comment=comment, role=role,
                ip=(ip or "")[:64] or None, ts=now, updated_at=now))
    return _summary()


def get_mine(visitor_id: str) -> MyFeedback | None:
    vid = (visitor_id or "").strip()[:64]
    if not vid:
        return None
    with engine.connect() as c:
        row = c.execute(select(feedback.c.rating, feedback.c.comment, feedback.c.role)
                        .where(feedback.c.visitor_id == vid)).first()
    if not row:
        return None
    return MyFeedback(rating=int(row[0]), comment=row[1] or "", role=row[2] or "")


def _summary() -> FeedbackResult:
    with engine.connect() as c:
        count = c.execute(select(func.count()).select_from(feedback)).scalar() or 0
        avg = c.execute(select(func.avg(feedback.c.rating))).scalar()
    return FeedbackResult(ok=True, count=int(count), average=round(float(avg), 2) if avg else 0.0)


def get_list(limit: int = 100) -> FeedbackList:
    """明細(含留言/IP,個資)—— 僅供登入後檢視;最新更新在前。"""
    with engine.connect() as c:
        count = c.execute(select(func.count()).select_from(feedback)).scalar() or 0
        avg = c.execute(select(func.avg(feedback.c.rating))).scalar()
        rows = c.execute(
            select(feedback.c.rating, feedback.c.comment, feedback.c.role,
                   feedback.c.ts, feedback.c.visitor_id, feedback.c.ip)
            .order_by(feedback.c.updated_at.desc()).limit(min(500, max(1, limit)))
        ).all()
    items = [FeedbackItem(rating=int(r[0]), comment=r[1] or "", role=r[2] or "",
                          ts=r[3], visitor_id=r[4], ip=r[5]) for r in rows]
    return FeedbackList(count=int(count), average=round(float(avg), 2) if avg else 0.0, items=items)
