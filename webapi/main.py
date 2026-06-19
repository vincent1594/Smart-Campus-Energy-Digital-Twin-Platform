"""Campus Electrical Digital Twin V1 —— FastAPI 進入點。"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from webapi import state
from webapi.config import FRONTEND_ORIGINS
from webapi.routes import analytics, assets, buildings, dashboard, demand, eui, history, powerflow, scenario, settings, topology


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時載入 base model 並算一次 base 潮流 (之後快取)
    state.init_state()
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


@app.get("/api/health", tags=["health"])
def health():
    from webapi.db import is_postgres
    return {"status": "ok", "db": "postgres" if is_postgres() else "sqlite"}
