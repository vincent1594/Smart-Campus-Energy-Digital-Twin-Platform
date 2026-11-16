"""CI 煙霧/回歸測試:後端能啟動、API 回 200、各電網潮流收斂且數值不漂移。"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from networks.registry import PROVIDERS
from webapi.main import app

NETWORK_IDS = list(PROVIDERS)


@pytest.fixture(scope="module")
def client():
    # with 區塊會觸發 lifespan → state.init_state() 建模型並跑 base 潮流
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_networks_listed(client):
    r = client.get("/api/networks")
    assert r.status_code == 200
    assert {n["id"] for n in r.json()} == set(NETWORK_IDS)


@pytest.mark.parametrize("nid", NETWORK_IDS)
@pytest.mark.parametrize("path", ["dashboard", "powerflow", "buildings", "topology"])
def test_core_endpoints(client, nid, path):
    r = client.get(f"/api/{nid}/{path}")
    assert r.status_code == 200, r.text[:500]


@pytest.mark.parametrize("nid", NETWORK_IDS)
def test_powerflow_sane(client, nid):
    """潮流必須收斂、電壓與負載率落在物理合理範圍。改壞拓撲/參數會在這裡被擋下。"""
    pf = client.get(f"/api/{nid}/powerflow").json()
    assert pf["converged"] is True
    assert pf["total_load_kw"] > 0
    assert 0.90 <= pf["min_voltage_pu"] <= 1.10
    assert pf["system_loss_kw"] >= 0
    assert pf["system_loss_kw"] < 0.1 * pf["total_load_kw"]
    assert pf["max_transformer_load_ratio_percent"] < 150


# 基準值 (2026-11-16 本機實測)。刻意修改模型後數字合理變動 → 更新這裡即可。
BASELINE = {
    "north": {"total_load_kw": 4220.1, "system_loss_kw": 62.0, "max_transformer_load_ratio_percent": 56.5},
    "south": {"total_load_kw": 1653.0, "system_loss_kw": 19.5, "max_transformer_load_ratio_percent": 35.1},
}


@pytest.mark.parametrize("nid", list(BASELINE))
def test_powerflow_regression(client, nid):
    """數值回歸:base 潮流結果偏離基準 >2% 即失敗,抓「沒報錯但數字悄悄變了」。"""
    pf = client.get(f"/api/{nid}/powerflow").json()
    for key, expected in BASELINE[nid].items():
        assert pf[key] == pytest.approx(expected, rel=0.02), f"{nid}.{key}: {pf[key]} vs 基準 {expected}"
