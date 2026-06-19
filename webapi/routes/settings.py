"""業務設定 API。

GET  /api/settings        取所有已存設定(key-value)
PUT  /api/settings        批次寫入/更新設定 → 回最新全部
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from webapi.services import settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsIn(BaseModel):
    values: dict[str, Any]
    by: str = ""


@router.get("")
def get_settings() -> dict[str, Any]:
    return settings_service.get_all()


@router.put("")
def put_settings(body: SettingsIn) -> dict[str, Any]:
    return settings_service.set_many(body.values, body.by)
