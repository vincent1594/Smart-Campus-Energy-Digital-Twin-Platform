"""北電錶 network provider —— 對外露出統一介面 (FEEDERS / build_net / run_power_flow)。

webapi 不再直接 import 根目錄的 data/models/analysis,而是透過各網 provider 取得模型,
使單一後端可同時載入南、北兩套獨立電網 (模組命名空間以 networks.<net>.* 隔離)。
"""
from __future__ import annotations

from networks.north.data.network_structure import FEEDERS
from networks.north.models.network_builder import build_network_s1_baseline
from networks.north.analysis.power_flow import run_s1_baseline_powerflow

NETWORK_ID = "north"
DISPLAY_NAME = "北電錶"

# 本網對外開放的功能 (路由層以 require_capability 把關)。北電錶資料齊全,全開。
CAPABILITIES = {
    "dashboard", "topology", "powerflow", "assets", "buildings", "scenario",
    "demand", "eui", "history", "forecast",
}


def build_net():
    """建構北電錶 PandaPower 網路 (尚未跑潮流)。"""
    return build_network_s1_baseline()


def run_power_flow(net) -> dict:
    """在 (可能已修改的) net 上重跑潮流,回傳既有 power_flow 的 results dict。"""
    _, results = run_s1_baseline_powerflow(net=net, verbose=False)
    return results
