"""重建前端靜態檔 webui/public/forecast-day.json(校園總攬「日曲線」24 小時潮流快照)。

前端日曲線優先讀這個預先算好的靜態檔(零等待),讀不到才打 API。
**改了模型、負載、EMS 資料或電網拓撲後要重跑**,否則日曲線會與其他頁面數字不一致。

執行 (在 repo 根目錄):
    python -m tools.build_forecast_day          # 重建並寫檔
    python -m tools.build_forecast_day --check  # 只比對,不寫檔;過時則以非 0 結束

做法:在本機起後端 (不需另開 server),呼叫 GET /api/north/scenario/forecast-day,
把回應 bytes 原樣寫檔 —— 與 API 回傳逐位元組相同。
需要 httpx (FastAPI TestClient 用;屬開發工具,不在部署用的 requirements.txt):pip install httpx
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "webui" / "public" / "forecast-day.json"
ENDPOINT = "/api/north/scenario/forecast-day"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    check_only = "--check" in sys.argv[1:]

    from fastapi.testclient import TestClient
    from webapi.main import app

    with TestClient(app) as client:
        r = client.get(ENDPOINT)
    if r.status_code != 200:
        print(f"✗ {ENDPOINT} 回應 {r.status_code}: {r.text[:300]}")
        return 2

    new = r.content
    old = OUT.read_bytes() if OUT.exists() else b""
    if new == old:
        print(f"✓ {OUT.relative_to(REPO)} 已是最新 ({len(new):,} bytes),無需更新")
        return 0
    if check_only:
        print(f"✗ {OUT.relative_to(REPO)} 已過時 —— 請執行 python -m tools.build_forecast_day")
        return 1
    OUT.write_bytes(new)
    print(f"✓ 已更新 {OUT.relative_to(REPO)} ({len(old):,} → {len(new):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
