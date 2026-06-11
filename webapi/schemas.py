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
    system_loss_kw: float
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
    system_loss_kw: float
    min_voltage_pu: float
    max_transformer_load_ratio_percent: float
    max_feeder_load_ratio_percent: float
    status: str = "OK"


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
