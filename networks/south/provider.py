"""南電錶 network provider —— 對外露出統一介面 (FEEDERS / build_net / run_power_flow)。

與 networks.north.provider 對稱;模組命名空間以 networks.south.* 隔離,
故可與北電錶於同一 Python 程序並存。
"""
from __future__ import annotations

from networks.south.data.network_structure import FEEDERS
from networks.south.models.network_builder import build_network_s1_baseline
from networks.south.analysis.power_flow import run_s1_baseline_powerflow

NETWORK_ID = "south"
DISPLAY_NAME = "南電錶"

# 南電錶負載仍為佔位、無 EMS/XGB → 初期僅開模型可直接導出的功能;
# 需量/EUI/歷史/預測待實測資料到位再加入 CAPABILITIES。
CAPABILITIES = {
    "dashboard", "topology", "powerflow", "assets", "buildings", "scenario",
}


def build_net():
    """建構南電錶 PandaPower 網路 (尚未跑潮流)。"""
    return build_network_s1_baseline()


def run_power_flow(net) -> dict:
    """在 (可能已修改的) net 上重跑潮流,回傳既有 power_flow 的 results dict。"""
    _, results = run_s1_baseline_powerflow(net=net, verbose=False)
    return results
