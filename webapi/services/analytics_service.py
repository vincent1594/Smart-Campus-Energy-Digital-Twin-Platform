"""訪客統計 —— 記錄拜訪、彙總每日/累計人數與次數。

儲存走 webapi/db(DATABASE_URL 有則 Postgres、否則 SQLite)。
「人數」= 不重複 visitor_id 數;「次數」= 拜訪筆數。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import distinct, func, insert, select

from webapi.db import engine, visits
from webapi.schemas import DailyVisit, VisitStats


def record_visit(visitor_id: str) -> VisitStats:
    visitor_id = (visitor_id or "anon").strip()[:64]
    now = datetime.now()
    with engine.begin() as c:
        c.execute(insert(visits).values(
            visitor_id=visitor_id, day=now.date().isoformat(),
            ts=now.isoformat(timespec="seconds"),
        ))
    return get_stats()


def get_stats(days: int = 14) -> VisitStats:
    today = date.today().isoformat()
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    with engine.connect() as c:
        today_visits = c.execute(select(func.count()).select_from(visits).where(visits.c.day == today)).scalar() or 0
        today_people = c.execute(select(func.count(distinct(visits.c.visitor_id))).where(visits.c.day == today)).scalar() or 0
        total_visits = c.execute(select(func.count()).select_from(visits)).scalar() or 0
        total_people = c.execute(select(func.count(distinct(visits.c.visitor_id)))).scalar() or 0
        since = c.execute(select(func.min(visits.c.day))).scalar()
        rows = c.execute(
            select(visits.c.day, func.count(), func.count(distinct(visits.c.visitor_id)))
            .where(visits.c.day >= start).group_by(visits.c.day)
        ).all()
    agg = {r[0]: (r[1], r[2]) for r in rows}
    daily = []
    for i in range(days - 1, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        v, p = agg.get(d, (0, 0))
        daily.append(DailyVisit(day=d, visits=int(v), people=int(p)))

    return VisitStats(
        today_visits=int(today_visits), today_people=int(today_people),
        total_visits=int(total_visits), total_people=int(total_people),
        since=since, daily=daily,
    )
