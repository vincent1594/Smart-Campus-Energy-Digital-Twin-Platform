"""持久化儲存層 —— 有 DATABASE_URL 用 Postgres(Neon),否則退回本機 SQLite。

訪客統計(visits)與業務設定(app_settings)共用此層。
- Render + Neon:資料永久(跨部署/休眠不掉)。
- 本機/自架:SQLite 檔 webapi/data/app.db。
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine
from sqlalchemy.engine import Engine

metadata = MetaData()

visits = Table(
    "visits", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("visitor_id", String(64), nullable=False),
    Column("day", String(10), nullable=False, index=True),
    Column("ts", String(32), nullable=False),
)

app_settings = Table(
    "app_settings", metadata,
    Column("key", String(64), primary_key=True),
    Column("value", Text, nullable=False),       # JSON 字串
    Column("updated_at", String(32), nullable=False),
    Column("updated_by", String(64), nullable=True),
)


def _make_engine() -> Engine:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        # Neon/Heroku 風格 → SQLAlchemy + psycopg2
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        return create_engine(url, pool_pre_ping=True, pool_recycle=300)
    path = Path(__file__).resolve().parent / "data" / "app.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})


engine = _make_engine()
metadata.create_all(engine)


def is_postgres() -> bool:
    return engine.url.get_backend_name().startswith("postgres")
