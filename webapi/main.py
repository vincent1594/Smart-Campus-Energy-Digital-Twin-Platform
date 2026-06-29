"""Campus Electrical Digital Twin V1 —— FastAPI 進入點。"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from webapi import state
from webapi.config import FRONTEND_ORIGINS
from webapi.routes import analytics, assets, buildings, dashboard, demand, eui, feedback, history, powerflow, scenario, settings, topology


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時載入 base model 並算一次 base 潮流 (之後快取)
    state.init_state()
    # 背景預熱日曲線 24h 快照(非阻塞),讓首位使用者免等;失敗不影響服務
    import threading

    def _warm():
        try:
            from webapi.services import scenario_service
            scenario_service.run_forecast_day()
        except Exception:  # noqa: BLE001
            pass
        # 預熱「能源管理」需量預測路徑:XGBoost 載模型 + EMS 讀檔 + 首日預測。
        # 這條路徑與上面的潮流暖機無關,不預熱則第一位開能源管理頁的人要現付冷啟動。
        # 日期對齊前端預設 (DemandManagement DATA_DEFAULT = 2023-06-08)。
        try:
            from webapi.services import demand_service
            from webapi.demand_config import CONTRACT_CAPACITY_KW, DEMAND_CHARGE_NT_PER_KW
            demand_service.get_status(CONTRACT_CAPACITY_KW, DEMAND_CHARGE_NT_PER_KW)
            demand_service.get_forecast("2023-06-08", CONTRACT_CAPACITY_KW, DEMAND_CHARGE_NT_PER_KW)
        except Exception:  # noqa: BLE001
            pass

    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(
    title="校園配電數位孿生平台 API",
    version="1.0.0",
    description="Campus Electrical Digital Twin V1 — Pandapower 為底層計算引擎,對外只暴露業務語意欄位。",
    lifespan=lifespan,
)

# 開發階段允許前端 (Vite 預設 5173) 跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(buildings.router)
app.include_router(assets.router)
app.include_router(topology.router)
app.include_router(powerflow.router)
app.include_router(scenario.router)
app.include_router(demand.router)
app.include_router(eui.router)
app.include_router(history.router)
app.include_router(analytics.router)
app.include_router(settings.router)
app.include_router(feedback.router)


@app.get("/api/networks", tags=["networks"])
def list_networks():
    """可切換的電網清單 (供前端南/北切換器)。"""
    from networks.registry import list_networks as _list
    return _list()


@app.get("/api/health", tags=["health"])
def health():
    from webapi.db import is_postgres
    return {"status": "ok", "db": "postgres" if is_postgres() else "sqlite"}
