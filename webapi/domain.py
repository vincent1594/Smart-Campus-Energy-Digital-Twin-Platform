"""Domain 實體 —— 由 repo 既有的 FEEDERS 拓樸解析而來 (見 core/engine.py)。

對應真實 11.4kV 校園:
    TPC(台電) -> VCB(12 路饋線開關) -> Feeder(HV 電纜段) -> Transformer(~40 台) -> Building(負載)

關係用單向 reference 表達:
    Building --transformer_id--> Transformer --feeder_id/vcb_id--> Feeder/VCB
建築名稱 V1 暫用負載代碼 (LOAD_N 等),日後補對照表即可。
這裡完全沒有 pandapower 欄位 —— 純業務語言。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class VCB:
    id: str
    name: str


@dataclass
class Feeder:
    """建築側 HV 饋線電纜段 (對應 net 的一條 line)。"""
    id: str           # 等同 net.line 的 name,例如 "VCB1_N_BUS"
    name: str
    vcb_id: str
    length_m: float
    line_name: str    # 用來反查 net.line index
    cross_section_mm2: Optional[float] = None  # 線徑 (mm²)
    resistance_ohm: Optional[float] = None     # 整段電阻 R (Ω) = r_ohm_per_km × 長度
    reactance_ohm: Optional[float] = None       # 整段電抗 X (Ω) = x_ohm_per_km × 長度


@dataclass
class Transformer:
    id: str           # 等同 net.trafo 的 name,例如 "TR_N_MAIN"
    name: str
    vcb_id: str
    feeder_id: Optional[str]   # 可能為 None (以母線開關直接耦合者)
    capacity_kva: float
    lv_kv: float
    trafo_type: str            # "油" / "乾"
    substation_bus: str


@dataclass
class Building:
    id: str           # 負載代碼,例如 "LOAD_N";V1 暫作顯示名稱
    name: str
    transformer_id: str
    load_kw: float
    power_factor: float


@dataclass
class CampusModel:
    vcbs: list[VCB] = field(default_factory=list)
    feeders: list[Feeder] = field(default_factory=list)
    transformers: list[Transformer] = field(default_factory=list)
    buildings: list[Building] = field(default_factory=list)
    source_name: str = "台電 (TPC) 11.4kV"

    # --- 查表 helper ---
    def vcb(self, vcb_id: str) -> Optional[VCB]:
        return next((v for v in self.vcbs if v.id == vcb_id), None)

    def feeder(self, feeder_id: str) -> Optional[Feeder]:
        return next((f for f in self.feeders if f.id == feeder_id), None)

    def transformer(self, transformer_id: str) -> Optional[Transformer]:
        return next((t for t in self.transformers if t.id == transformer_id), None)

    def building(self, building_id: str) -> Optional[Building]:
        return next((b for b in self.buildings if b.id == building_id), None)

    # --- 關係查詢 ---
    def buildings_on_transformer(self, transformer_id: str) -> list[Building]:
        return [b for b in self.buildings if b.transformer_id == transformer_id]

    def transformers_on_feeder(self, feeder_id: str) -> list[Transformer]:
        return [t for t in self.transformers if t.feeder_id == feeder_id]

    def transformers_on_vcb(self, vcb_id: str) -> list[Transformer]:
        return [t for t in self.transformers if t.vcb_id == vcb_id]

    def feeders_on_vcb(self, vcb_id: str) -> list[Feeder]:
        return [f for f in self.feeders if f.vcb_id == vcb_id]

    def buildings_on_feeder(self, feeder_id: str) -> list[Building]:
        tr_ids = {t.id for t in self.transformers_on_feeder(feeder_id)}
        return [b for b in self.buildings if b.transformer_id in tr_ids]

    def buildings_on_vcb(self, vcb_id: str) -> list[Building]:
        tr_ids = {t.id for t in self.transformers_on_vcb(vcb_id)}
        return [b for b in self.buildings if b.transformer_id in tr_ids]
