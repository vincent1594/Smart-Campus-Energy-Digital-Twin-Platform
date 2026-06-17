"""API 回傳用的 DTO (Pydantic)。

契約原則:這些 schema 是前後端的唯一介面,欄位一律用「業務語意」命名,
**絕不出現 pandapower 原始欄位名** (vm_pu / loading_percent / pl_mw / p_mw ...)。
前端拿到 voltage_pu / load_ratio_percent 後,顯示成「電壓」「負載率」等中文標籤。
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ---------- 潮流結果 ----------
class BuildingVoltage(BaseModel):
    building_id: str
    building_name: str
    voltage_pu: float


class TransformerLoading(BaseModel):
    transformer_id: str
    transformer_name: str
    capacity_kva: float
    actual_load_kva: float
    load_ratio_percent: float


class FeederLoading(BaseModel):
    feeder_id: str
    feeder_name: str
    load_ratio_percent: float


class PowerFlowResult(BaseModel):
    converged: bool
    status: str = "OK"   # OK / WARNING(電壓或熱越限) / ERROR(孤島或未供電)
    total_load_kw: float
    total_load_kvar: float = 0.0
    system_loss_kw: float
    system_loss_kvar: float = 0.0
    min_voltage_pu: float
    min_voltage_building_id: Optional[str] = None
    min_voltage_building_name: Optional[str] = None
    max_transformer_load_ratio_percent: float
    max_feeder_load_ratio_percent: float
    transformer_loadings: list[TransformerLoading]
    feeder_loadings: list[FeederLoading]
    building_voltages: list[BuildingVoltage]


# ---------- Dashboard ----------
class DashboardSummary(BaseModel):
    building_count: int
    transformer_count: int
    feeder_count: int
    vcb_count: int
    total_load_kw: float
    total_load_kvar: float = 0.0
    system_loss_kw: float
    system_loss_kvar: float = 0.0
    min_voltage_pu: float
    max_transformer_load_ratio_percent: float
    max_feeder_load_ratio_percent: float
    status: str = "OK"
    load_basis: str = ""   # 負載基準說明(情境/時點),例:S1 · 2023/03/01 14:00 半尖峰


# ---------- Building / Asset 查詢 ----------
class SupplyPathNode(BaseModel):
    kind: str   # "source" | "vcb" | "transformer" | "feeder" | "building"
    id: str
    name: str
    # 額外資訊(視 kind 而定):饋線=長度/線徑/負載率;變壓器=容量/負載率
    load_ratio_percent: Optional[float] = None
    length_m: Optional[float] = None
    cross_section_mm2: Optional[float] = None
    capacity_kva: Optional[float] = None


class BuildingDetail(BaseModel):
    id: str
    name: str
    estimated_load_kw: float
    power_factor: float
    vcb_id: str
    vcb_name: str
    feeder_id: Optional[str] = None
    feeder_name: Optional[str] = None
    transformer_id: str
    transformer_name: str
    transformer_capacity_kva: float
    supply_path: list[SupplyPathNode]


class BuildingSummary(BaseModel):
    id: str
    name: str
    estimated_load_kw: float
    feeder_name: str
    transformer_name: str


class TransformerDetail(BaseModel):
    id: str
    name: str
    capacity_kva: float
    lv_kv: float
    trafo_type: str
    vcb_id: str
    vcb_name: str
    feeder_id: Optional[str] = None
    feeder_name: Optional[str] = None
    connected_building_count: int
    connected_buildings: list[str]
    total_connected_load_kw: float
    load_ratio_percent: Optional[float] = None


class VcbDetail(BaseModel):
    id: str
    name: str
    feeder_count: int
    transformer_count: int
    transformers: list[str]
    connected_building_count: int
    total_connected_load_kw: float


class FeederDetail(BaseModel):
    id: str
    name: str
    vcb_id: str
    vcb_name: str
    length_m: float
    cross_section_mm2: Optional[float] = None
    overloaded: bool = False
    transformer_count: int
    transformers: list[str]
    connected_building_count: int
    connected_buildings: list[str]
    total_connected_load_kw: float
    load_ratio_percent: Optional[float] = None


# ---------- 變壓器規格明細 (原始銘牌/實測資料,供營繕組核對) ----------
# 忠實呈現「各站變壓器規格容量資料.xlsx」,不對應潮流模型。
class TransformerSpec(BaseModel):
    seq: str                              # 序號
    building: str                         # 建築物名稱
    tag: str                              # 變壓器編號 (TR-n)
    brand: str = ""                       # 廠牌
    year: str = ""                        # 製造年份
    capacity_kva: Optional[int] = None    # 變壓器容量
    trafo_type: str = ""                  # 變壓器型式 (油式/乾式)
    hv_kv: str = ""                        # 一次側額定電壓
    lv_v: str = ""                         # 二次側額定電壓 (線/相)
    circuit: str = ""                     # 迴路名稱
    load_desc: str = ""                   # 負載概述
    efficiency: Optional[float] = None    # 效率 η
    temperature_c: Optional[float] = None # 變壓器溫度 (°C)
    hv_actual_kv: str = ""                # 一次側實際電壓
    lv_actual_v: str = ""                 # 二次側實際電壓
    load_current_a: Optional[float] = None  # 負載電流 (A)
    power_factor: Optional[float] = None  # 功因
    avg_load_kw: Optional[float] = None   # 平均負載 (kW)
    load_ratio_percent: Optional[float] = None  # 負載率 (%)
    pf_regulator: str = ""                # 功因自動調整器
    capacitor_kvar: Optional[float] = None  # 裝置電容器量


# ---------- Topology (React Flow) ----------
class TopologyNode(BaseModel):
    id: str
    kind: str   # "source" | "vcb" | "transformer" | "feeder" | "building"
    label: str


class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str


class TopologyGraph(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]


# ---------- Scenario ----------
class BuildingLoadOverride(BaseModel):
    building_id: str
    load_kw: float


class ScenarioRequest(BaseModel):
    """所有欄位皆可選,未填者沿用 base。"""
    building_loads: Optional[list[BuildingLoadOverride]] = None
    total_load_kw: Optional[float] = None          # 設定總負載,依 base 比例分配到各棟
    transformer_capacities: Optional[dict[str, float]] = None  # {transformer_id: kVA}
    feeder_lengths: Optional[dict[str, float]] = None          # {feeder_id: m}


class ScenarioComparison(BaseModel):
    base: PowerFlowResult
    scenario: PowerFlowResult
