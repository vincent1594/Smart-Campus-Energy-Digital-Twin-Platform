"""訪客統計 —— 記錄拜訪、彙總每日/累計人數與次數。

以 SQLite(Python 內建,零額外套件)儲存,每筆 = 一次拜訪(visitor_id + 日期)。
- 「人數」= 不重複 visitor_id 數;「次數」= 拜訪筆數。
- 本機/自架:DB 檔永久。⚠ Render 免費版檔案系統會在重部署時清空,
  屆時要永久統計改接 Render Postgres(以同一介面替換即可)。
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from webapi.schemas import DailyVisit, VisitStats

_DB = Path(__file__).resolve().parents[1] / "data" / "analytics.db"


def _conn() -> sqlite3.Connection:
    _DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(_DB)
    c.execute(
        "CREATE TABLE IF NOT EXISTS visits ("
        "  visitor_id TEXT NOT NULL,"
        "  day TEXT NOT NULL,"
        "  ts TEXT NOT NULL"
        ")"
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day)")
    return c


def record_visit(visitor_id: str) -> VisitStats:
    visitor_id = (visitor_id or "anon").strip()[:64]
    now = datetime.now()
    with _conn() as c:
        c.execute("INSERT INTO visits(visitor_id, day, ts) VALUES (?,?,?)",
                  (visitor_id, now.date().isoformat(), now.isoformat(timespec="seconds")))
    return get_stats()


def get_stats(days: int = 14) -> VisitStats:
    today = date.today().isoformat()
    with _conn() as c:
        row = c.execute(
            "SELECT "
            "  (SELECT COUNT(*) FROM visits WHERE day=?),"
            "  (SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE day=?),"
            "  (SELECT COUNT(*) FROM visits),"
            "  (SELECT COUNT(DISTINCT visitor_id) FROM visits),"
            "  (SELECT MIN(day) FROM visits)",
            (today, today),
        ).fetchone()
        today_visits, today_people, total_visits, total_people, since = row

        # 近 days 天逐日序列(補零)
        agg = {
            d: (v, p) for d, v, p in c.execute(
                "SELECT day, COUNT(*), COUNT(DISTINCT visitor_id) FROM visits "
                "WHERE day >= ? GROUP BY day",
                ((date.today() - timedelta(days=days - 1)).isoformat(),),
            ).fetchall()
        }
    daily = []
    for i in range(days - 1, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        v, p = agg.get(d, (0, 0))
        daily.append(DailyVisit(day=d, visits=v, people=p))

    return VisitStats(
        today_visits=today_visits or 0, today_people=today_people or 0,
        total_visits=total_visits or 0, total_people=total_people or 0,
        since=since, daily=daily,
    )
