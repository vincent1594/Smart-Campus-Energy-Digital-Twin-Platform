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
    grid_import_kw: float = 0.0   # 市電(台電)進線實功率
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
    building_count: int        # 低壓負載點數(含合併負載,目前 40)
    substation_count: int = 0  # 變電站母線數 = 實際供電建築數(北電錶 23)
    transformer_count: int
    feeder_count: int
    vcb_count: int
    total_load_kw: float
    total_load_kvar: float = 0.0
    system_loss_kw: float
    system_loss_kvar: float = 0.0
    grid_import_kw: float = 0.0   # 市電(台電)進線實功率
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


# 模擬時間點:用 XGBoost 預測該時刻各饋線負載後模擬
class ForecastRequest(BaseModel):
    timestamp: str                        # "YYYY-MM-DD HH:MM"
    pv_factor: float = 0.8                # 太陽能出力係數(日照強弱)


# ---------- 需量 / 契約容量 (營繕組) ----------
class DemandStatus(BaseModel):
    """現況需量 vs 契約容量。需量取市電(台電)進線實功率。"""
    current_demand_kw: float
    contract_capacity_kw: float
    demand_charge_nt_per_kw: float
    utilization_percent: float            # 需量 / 契約 × 100
    headroom_kw: float                    # 契約 - 需量 (可為負 = 已超約)
    status: str = "OK"                    # OK / WARNING(接近) / EXCEED(超約)
    load_basis: str = ""                  # 現況需量的負載基準說明


class HourlyDemand(BaseModel):
    hour: int                             # 0~23
    demand_kw: float


class FeederDemand(BaseModel):
    feeder_id: str
    feeder_name: str
    demand_kw: float


class ShedSuggestion(BaseModel):
    """為回到契約容量內,建議於尖峰時段調控/卸載的饋線。"""
    feeder_id: str
    feeder_name: str
    shed_kw: float                        # 該饋線尖峰時段需量
    cumulative_kw: float                  # 累計可削減量 (含本條)


class DemandForecast(BaseModel):
    """某日逐時需量預測 (XGBoost) 與超約評估。"""
    date: str                             # "YYYY-MM-DD"
    contract_capacity_kw: float
    demand_charge_nt_per_kw: float
    hourly: list[HourlyDemand]
    peak_kw: float
    peak_hour: int                        # 尖峰小時 0~23
    overshoot_kw: float                   # max(0, 尖峰 - 契約)
    penalty_nt: float                     # 估算單月超約罰款
    status: str = "OK"                    # OK / WARNING / EXCEED
    peak_feeders: list[FeederDemand]      # 尖峰時刻各饋線需量 (降冪)
    shed_suggestions: list[ShedSuggestion]


# ---------- 時間電價 月電費試算 ----------
class TariffRates(BaseModel):
    """台電高壓三段式時間電價費率 (可編輯)。非夏月無尖峰,故無 nonsummer_peak。"""
    summer_peak_kwh: float                # 夏月尖峰  NT$/kWh
    summer_midpeak_kwh: float             # 夏月半尖峰
    summer_offpeak_kwh: float             # 夏月離峰
    nonsummer_midpeak_kwh: float          # 非夏月半尖峰
    nonsummer_offpeak_kwh: float          # 非夏月離峰
    basic_summer_kw: float                # 夏月經常契約基本電費 NT$/kW/月
    basic_nonsummer_kw: float             # 非夏月經常契約基本電費


class TariffInfo(BaseModel):
    """預設費率 + 時段窗格說明,供前端預填可編輯表單。"""
    rates: TariffRates
    window_note: str


class BillRequest(BaseModel):
    month: str                            # "YYYY-MM"
    contract_capacity_kw: float
    rates: Optional[TariffRates] = None   # 未給用 demand_config 預設


class BillPeriodLine(BaseModel):
    period: str                           # 尖峰/半尖峰/離峰
    kwh: float                            # 該時段預測度數
    rate: float                           # NT$/kWh
    charge: float                         # NT$ = kwh × rate
    peak_kw: float                        # 該時段最高需量 (kW)


class MonthlyBill(BaseModel):
    month: str
    season: str                           # 夏月 / 非夏月
    contract_capacity_kw: float
    energy_lines: list[BillPeriodLine]    # 各時段流動電費
    energy_charge: float                  # 流動電費合計
    basic_rate: float                     # 採用的基本電費單價 NT$/kW
    basic_charge: float                   # 基本電費 = 契約 × 單價
    peak_kw: float                        # 全月預測最高需量
    overshoot_kw: float                   # max(0, 尖峰需量 - 契約)
    overshoot_penalty: float              # 超約罰款 (2/3 倍級距)
    total: float                          # 月電費合計
    window_note: str
