"""業務設定持久化 —— 契約容量/費率/EUI 基準等「可校正參數」存資料庫。

key-value(value 為 JSON 字串);儲存走 webapi/db(Postgres / SQLite)。
讀取時各服務以 get(key, 預設值) 取代寫死常數,讓營繕組校正後的值留得住。
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import select

from webapi.db import app_settings, engine


def get_all() -> dict[str, Any]:
    with engine.connect() as c:
        rows = c.execute(select(app_settings.c.key, app_settings.c.value)).all()
    out: dict[str, Any] = {}
    for k, v in rows:
        try:
            out[k] = json.loads(v)
        except (ValueError, TypeError):
            out[k] = v
    return out


def get(key: str, default: Any = None) -> Any:
    with engine.connect() as c:
        v = c.execute(select(app_settings.c.value).where(app_settings.c.key == key)).scalar()
    if v is None:
        return default
    try:
        return json.loads(v)
    except (ValueError, TypeError):
        return v


def set_many(values: dict[str, Any], by: str = "") -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    with engine.begin() as c:
        for k, val in values.items():
            payload = json.dumps(val, ensure_ascii=False)
            res = c.execute(app_settings.update().where(app_settings.c.key == k)
                            .values(value=payload, updated_at=now, updated_by=by))
            if res.rowcount == 0:   # 方言無關 upsert:更新不到才插入
                c.execute(app_settings.insert().values(key=k, value=payload, updated_at=now, updated_by=by))
    return get_all()
