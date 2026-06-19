"""持久化儲存層 —— 有 DATABASE_URL 用 Postgres(Neon),否則退回本機 SQLite。

訪客統計(visits)與業務設定(app_settings)共用此層。
- Render + Neon:資料永久(跨部署/休眠不掉)。
- 本機/自架:SQLite 檔 webapi/data/app.db。
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine, inspect, text
from sqlalchemy.engine import Engine

metadata = MetaData()

visits = Table(
    "visits", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("visitor_id", String(64), nullable=False),
    Column("day", String(10), nullable=False, index=True),
    Column("ts", String(32), nullable=False),
    Column("ip", String(64), nullable=True),
)

app_settings = Table(
    "app_settings", metadata,
    Column("key", String(64), primary_key=True),
    Column("value", Text, nullable=False),       # JSON 字串
    Column("updated_at", String(32), nullable=False),
    Column("updated_by", String(64), nullable=True),
)

# 使用者回饋:星等 + 留言 + 選填身分;一人(visitor_id)一則、可更新
feedback = Table(
    "feedback", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("visitor_id", String(64), nullable=False, unique=True),
    Column("rating", Integer, nullable=False),   # 1–5 星
    Column("comment", Text, nullable=True),
    Column("role", String(32), nullable=True),   # 選填身分
    Column("ip", String(64), nullable=True),
    Column("ts", String(32), nullable=False),    # 首次送出時間
    Column("updated_at", String(32), nullable=True),
)


def _sqlite_engine() -> Engine:
    path = Path(__file__).resolve().parent / "data" / "app.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})


def _make_engine() -> Engine:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        return _sqlite_engine()
    # Neon/Heroku 風格 → SQLAlchemy + psycopg2
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    try:
        eng = create_engine(url, pool_pre_ping=True, pool_recycle=300)
        with eng.connect() as c:        # 連線測試:連不上就退回 SQLite,不拖垮整個後端
            c.execute(text("SELECT 1"))
        return eng
    except Exception as exc:  # noqa: BLE001
        print(f"[db] Postgres 連線失敗,退回 SQLite:{exc}")
        return _sqlite_engine()


engine = _make_engine()
try:
    metadata.create_all(engine)
    # 既有 visits 表(早於 ip 欄)補欄;create_all 不會替既有表加欄
    cols = [c["name"] for c in inspect(engine).get_columns("visits")]
    if "ip" not in cols:
        with engine.begin() as _c:
            _c.execute(text("ALTER TABLE visits ADD COLUMN ip VARCHAR(64)"))
except Exception as exc:  # noqa: BLE001 - 建表/補欄失敗不應讓整個 app 起不來
    print(f"[db] create_all/migrate 失敗:{exc}")


def is_postgres() -> bool:
    return engine.url.get_backend_name().startswith("postgres")
