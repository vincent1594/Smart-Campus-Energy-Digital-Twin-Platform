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
    iron_loss_kw: float = 0.0     # 鐵損(變壓器空載/核損,與負載無關,只要通電就存在)
    copper_loss_kw: float = 0.0   # 銅損(線損 + 變壓器負載損,隨負載電流平方變化)
    grid_import_kw: float = 0.0   # 市電(台電)進線實功率
    grid_import_kvar: float = 0.0 # 市電進線無功(進線端,含電容器補償後)
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
    grid_import_kvar: float = 0.0 # 市電進線無功(進線端,含電容器補償後)
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
    floor_area_m2: Optional[float] = None   # 樓地板面積 (112年統計表);多負載點共用該棟總面積
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
    floor_area_m2: Optional[float] = None   # 樓地板面積 (112年統計表)
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
    length_estimated: bool = True            # 長度為推估值(實際佈線長度未量測)
    cross_section_mm2: Optional[float] = None
    resistance_ohm: Optional[float] = None   # 整段 R (Ω),依線徑單位阻抗 × 長度推算
    reactance_ohm: Optional[float] = None    # 整段 X (Ω)
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


# ---------- 歷史趨勢 (EMS 實測時序) ----------
class HistoryDaily(BaseModel):
    date: str
    avg_kw: float
    peak_kw: float


class HistoryHourProfile(BaseModel):
    hour: int
    weekday_kw: float             # 平日該時平均需量
    weekend_kw: float             # 假日該時平均需量


class HistoryFeeder(BaseModel):
    feeder: str                   # VCBx
    name: str
    avg_kw: float                 # 期間平均


class HistoryReport(BaseModel):
    period_start: str
    period_end: str
    days: int
    peak_kw: float
    peak_time: str                # 全期尖峰時刻
    avg_kw: float
    total_kwh: float
    source: str                   # 資料來源/範圍說明
    daily: list[HistoryDaily]     # 每日 平均/尖峰
    profile: list[HistoryHourProfile]  # 典型日 24h(平日/假日)
    feeders: list[HistoryFeeder]  # 各饋線期間平均(降冪)


# ---------- EUI 用電強度 (營繕組節能) ----------
class BuildingEUI(BaseModel):
    letter: str
    name: str
    floor_area_m2: float
    load_kw: float                # 現況負載(分配年用電量依據)
    annual_kwh: float             # 估算年用電量
    eui: float                    # kWh/m²·年
    area_reliable: bool = True    # False=面積偏小,EUI 易受分母放大,僅供參考


class EUIReport(BaseModel):
    year: int
    campus_eui: float             # 全校 EUI
    campus_annual_kwh: float
    total_floor_area_m2: float
    benchmark: float              # 參考基準 kWh/m²·年(全國大專參考,可校正)
    buildings: list[BuildingEUI]  # 依 EUI 降冪


# ---------- 設備汰換風險排序 (營繕組資本門) ----------
class RiskFactor(BaseModel):
    name: str          # 屆齡 / 負載 / 溫度 / 效率
    detail: str        # 顯示文字,例:屆齡 30 年(1996)
    score: float       # 0-100 該因子風險分數
    weight: float      # 權重


class TransformerRisk(BaseModel):
    tag: str
    building: str = ""
    brand: str = ""
    year: str = ""
    age_years: Optional[int] = None
    capacity_kva: Optional[int] = None
    trafo_type: str = ""
    load_ratio_percent: Optional[float] = None
    temperature_c: Optional[float] = None
    efficiency: Optional[float] = None
    risk_score: float          # 0-100 綜合風險
    risk_level: str            # 高 / 中 / 低
    factors: list[RiskFactor]
    reason: str                # 主要風險因子 + 建議行動


# ---------- 設備汰換 投資回收 (營繕組資本門效益) ----------
class ReplacementEconomics(BaseModel):
    """單台變壓器:換新成本 vs 換高效機年省電費 → 回收年限。"""
    tag: str
    building: str = ""
    capacity_kva: Optional[int] = None
    trafo_type: str = ""
    age_years: Optional[int] = None
    load_ratio_percent: Optional[float] = None
    risk_level: str            # 高 / 中 / 低 (沿用風險排序)
    risk_score: float
    capex_nt: float            # 換新成本 = 容量 × 單價 × 型式係數
    annual_saving_kwh: float   # 年損耗節省度數 (舊機 vs 新高效機)
    annual_saving_nt: float    # 年省電費 = 節省度數 × 電價
    payback_years: Optional[float] = None   # 回收年限 = 成本 / 年省;節省≤0 時為 None


class ReplacementEconomicsReport(BaseModel):
    unit_price_nt_per_kva: float       # 換新單價假設
    energy_price_nt_per_kwh: float     # 電價假設 (損耗全年計)
    loss_note: str                     # 損耗模型假設說明
    items: list[ReplacementEconomics]  # 依回收年限升冪 (最划算在前)
    # 高風險群彙總 (供資本門總額編列)
    high_risk_count: int
    high_risk_capex_nt: float
    high_risk_annual_saving_nt: float
    high_risk_blended_payback_years: Optional[float]


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


class FeederDemand(BaseModel):
    feeder_id: str
    feeder_name: str
    demand_kw: float


class HourlyDemand(BaseModel):
    hour: int                             # 0~23
    demand_kw: float                      # 預測
    actual_kw: Optional[float] = None     # EMS 實測 (資料期內才有,供預測vs實際比較)
    feeders: list[FeederDemand] = []      # 該小時各饋線需量 (降冪),供逐時查詢


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
    # 預測 vs 實際 (資料期內才有;未來日期為 None)
    actual_peak_kw: Optional[float] = None
    mae_kw: Optional[float] = None        # 當日逐時平均絕對誤差
    mape_pct: Optional[float] = None      # 當日逐時 MAPE


# ---------- 契約容量最佳化 (營繕組殺手功能) ----------
class MeasuredMonthPeak(BaseModel):
    """EMS 實測:某月最高需量 + 對現況契約的單月超約罰款 (純實測,零外推)。"""
    month: str                            # "2023-06"
    peak_kw: float
    overshoot_kw: float                   # max(0, 實測尖峰 - 現況契約)
    penalty_nt: float                     # 該月實測超約罰款 (2/3 倍級距)


class ContractCurvePoint(BaseModel):
    """年成本曲線一點:某候選契約容量下的基本電費 / 罰款 / 總成本。"""
    contract_kw: float
    basic_nt: float                       # 基本電費 = 契約 × 單價 × 12 月
    penalty_nt: float                     # 全年超約罰款 (依假設月尖峰)
    total_nt: float                       # 年總成本 = 基本 + 罰款


class ContractOptimization(BaseModel):
    """掃契約容量求「基本電費 + 全年超約罰款」最小的最佳契約與全年估省。"""
    rate_nt_per_kw: float                 # 採用的基本電費單價
    high_months: int                      # 假設:全年高需量月數
    offseason_ratio: float                # 假設:離峰季尖峰 / 夏季尖峰
    summer_peak_kw: float                 # 尖峰錨點 (EMS 實測月最高需量)
    measured: list[MeasuredMonthPeak]     # 實測各月尖峰 + 罰款 (零外推)
    current_contract_kw: float
    current_annual_nt: float              # 現況契約年總成本
    current_penalty_nt: float             # 現況契約全年超約罰款
    recommended_contract_kw: float        # 最佳契約
    recommended_annual_nt: float          # 最佳契約年總成本
    recommended_penalty_nt: float
    annual_savings_nt: float              # 純調契約的全年估省 = 現況 - 最佳
    peakshave_savings_nt: float           # 削峰至契約內可省 (= 現況全年超約罰款)
    curve: list[ContractCurvePoint]       # 年成本 vs 契約容量曲線
    note: str                             # 資料/假設說明


# ---------- 訪客統計 ----------
class DailyVisit(BaseModel):
    day: str          # YYYY-MM-DD
    visits: int       # 當日拜訪次數
    people: int       # 當日不重複訪客數


class VisitStats(BaseModel):
    today_visits: int
    today_people: int
    total_visits: int
    total_people: int
    since: Optional[str] = None      # 起始統計日
    daily: list[DailyVisit] = []     # 近 N 天逐日


class RecentVisit(BaseModel):
    ts: str                          # 時間
    ip: Optional[str] = None         # 來源 IP(個資,僅登入後可見)
    visitor_id: str


# ---------- 使用者回饋(評分 + 留言)----------
class FeedbackIn(BaseModel):
    visitor_id: str = "anon"
    rating: int                      # 1–5 星
    comment: str = ""
    role: str = ""                   # 選填身分:營繕組/總務處/長官/老師/訪客


class MyFeedback(BaseModel):
    rating: int
    comment: str = ""
    role: str = ""


class FeedbackItem(BaseModel):
    rating: int
    comment: str = ""
    role: str = ""
    ts: str
    visitor_id: str
    ip: Optional[str] = None         # 個資,僅登入後可見


class FeedbackList(BaseModel):
    count: int
    average: float
    items: list[FeedbackItem] = []


class FeedbackResult(BaseModel):
    ok: bool
    average: float
    count: int


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
