// 後端 DTO 的 TS 鏡像。欄位皆為業務語意,無 pandapower 原始欄位名。

export interface DashboardSummary {
  building_count: number;       // 低壓負載點數(含合併負載)
  substation_count: number;     // 變電站母線數 = 實際供電建築數
  transformer_count: number;
  feeder_count: number;
  vcb_count: number;
  total_load_kw: number;
  total_load_kvar: number;
  system_loss_kw: number;
  system_loss_kvar: number;
  grid_import_kw: number;       // 市電進線實功率
  grid_import_kvar: number;     // 市電進線無功(進線端,含電容器補償後)
  min_voltage_pu: number;
  max_transformer_load_ratio_percent: number;
  max_feeder_load_ratio_percent: number;
  status: string; // OK / WARNING / ERROR
  load_basis?: string; // 負載基準(情境/時點)
}

export interface SupplyPathNode {
  kind: "source" | "vcb" | "feeder" | "transformer" | "building";
  id: string;
  name: string;
  load_ratio_percent?: number | null;
  length_m?: number | null;
  cross_section_mm2?: number | null;
  capacity_kva?: number | null;
}

export interface BuildingSummary {
  id: string;
  name: string;
  floor_area_m2?: number | null;   // 樓地板面積 m²(112年統計表)
  estimated_load_kw: number;
  feeder_name: string;
  transformer_name: string;
}

export interface BuildingDetail {
  id: string;
  name: string;
  estimated_load_kw: number;
  power_factor: number;
  floor_area_m2?: number | null;   // 樓地板面積 m²(112年統計表)

  vcb_id: string;
  vcb_name: string;
  feeder_id: string | null;
  feeder_name: string | null;
  transformer_id: string;
  transformer_name: string;
  transformer_capacity_kva: number;
  supply_path: SupplyPathNode[];
}

export interface TransformerDetail {
  id: string;
  name: string;
  capacity_kva: number;
  lv_kv: number;
  trafo_type: string;
  vcb_id: string;
  vcb_name: string;
  feeder_id: string | null;
  feeder_name: string | null;
  connected_building_count: number;
  connected_buildings: string[];
  total_connected_load_kw: number;
  load_ratio_percent: number | null;
}

// 變壓器規格明細(原始銘牌/實測資料,供營繕組核對)
export interface TransformerSpec {
  seq: string;
  building: string;
  tag: string;
  brand: string;
  year: string;
  capacity_kva: number | null;
  trafo_type: string;
  hv_kv: string;
  lv_v: string;
  circuit: string;
  load_desc: string;
  efficiency: number | null;
  temperature_c: number | null;
  hv_actual_kv: string;
  lv_actual_v: string;
  load_current_a: number | null;
  power_factor: number | null;
  avg_load_kw: number | null;
  load_ratio_percent: number | null;
  pf_regulator: string;
  capacitor_kvar: number | null;
}

// 設備汰換風險排序(營繕組資本門)
export interface RiskFactor {
  name: string;        // 屆齡/負載/溫度/效率
  detail: string;
  score: number;       // 0-100
  weight: number;
}

export interface TransformerRisk {
  tag: string;
  building: string;
  brand: string;
  year: string;
  age_years: number | null;
  capacity_kva: number | null;
  trafo_type: string;
  load_ratio_percent: number | null;
  temperature_c: number | null;
  efficiency: number | null;
  risk_score: number;       // 0-100
  risk_level: string;       // 高/中/低
  factors: RiskFactor[];
  reason: string;
}

// ---------- 設備汰換 投資回收 ----------
export interface ReplacementEconomics {
  tag: string;
  building: string;
  capacity_kva: number | null;
  trafo_type: string;
  age_years: number | null;
  load_ratio_percent: number | null;
  risk_level: string;          // 高/中/低
  risk_score: number;
  capex_nt: number;            // 換新成本
  annual_saving_kwh: number;
  annual_saving_nt: number;    // 年省電費
  payback_years: number | null; // 回收年限(節省≤0 時 null)
}

export interface ReplacementEconomicsReport {
  unit_price_nt_per_kva: number;
  energy_price_nt_per_kwh: number;
  loss_note: string;
  items: ReplacementEconomics[];
  high_risk_count: number;
  high_risk_capex_nt: number;
  high_risk_annual_saving_nt: number;
  high_risk_blended_payback_years: number | null;
}

export interface VcbDetail {
  id: string;
  name: string;
  feeder_count: number;
  transformer_count: number;
  transformers: string[];
  connected_building_count: number;
  total_connected_load_kw: number;
}

export interface FeederDetail {
  id: string;
  name: string;
  vcb_id: string;
  vcb_name: string;
  length_m: number;
  cross_section_mm2?: number | null;
  overloaded: boolean;
  transformer_count: number;
  transformers: string[];
  connected_building_count: number;
  connected_buildings: string[];
  total_connected_load_kw: number;
  load_ratio_percent: number | null;
}

export interface TransformerLoading {
  transformer_id: string;
  transformer_name: string;
  capacity_kva: number;
  actual_load_kva: number;
  load_ratio_percent: number;
}

export interface FeederLoading {
  feeder_id: string;
  feeder_name: string;
  load_ratio_percent: number;
}

export interface BuildingVoltage {
  building_id: string;
  building_name: string;
  voltage_pu: number;
}

export interface PowerFlowResult {
  converged: boolean;
  status: string;
  total_load_kw: number;
  total_load_kvar: number;
  system_loss_kw: number;
  system_loss_kvar: number;
  grid_import_kw: number;
  grid_import_kvar: number;
  min_voltage_pu: number;
  min_voltage_building_id: string | null;
  min_voltage_building_name: string | null;
  max_transformer_load_ratio_percent: number;
  max_feeder_load_ratio_percent: number;
  transformer_loadings: TransformerLoading[];
  feeder_loadings: FeederLoading[];
  building_voltages: BuildingVoltage[];
}

export interface TopologyNode {
  id: string;
  kind: SupplyPathNode["kind"];
  label: string;
}
export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
}
export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface ScenarioRequest {
  building_loads?: { building_id: string; load_kw: number }[];
  total_load_kw?: number;
  transformer_capacities?: Record<string, number>;
  feeder_lengths?: Record<string, number>;
}

export interface ScenarioComparison {
  base: PowerFlowResult;
  scenario: PowerFlowResult;
}

export interface ForecastRequest {
  timestamp: string;       // "YYYY-MM-DD HH:MM"
  pv_factor?: number;      // 太陽能出力係數
}

// ---------- 需量 / 契約容量 (營繕組) ----------
export interface DemandStatus {
  current_demand_kw: number;
  contract_capacity_kw: number;
  demand_charge_nt_per_kw: number;
  utilization_percent: number;
  headroom_kw: number;
  status: string;          // OK / WARNING / EXCEED
  load_basis: string;
}

export interface HourlyDemand {
  hour: number;
  demand_kw: number;
}

export interface FeederDemand {
  feeder_id: string;
  feeder_name: string;
  demand_kw: number;
}

export interface ShedSuggestion {
  feeder_id: string;
  feeder_name: string;
  shed_kw: number;
  cumulative_kw: number;
}

export interface DemandForecast {
  date: string;
  contract_capacity_kw: number;
  demand_charge_nt_per_kw: number;
  hourly: HourlyDemand[];
  peak_kw: number;
  peak_hour: number;
  overshoot_kw: number;
  penalty_nt: number;
  status: string;          // OK / WARNING / EXCEED
  peak_feeders: FeederDemand[];
  shed_suggestions: ShedSuggestion[];
}

// ---------- 歷史趨勢 (EMS 實測) ----------
export interface HistoryDaily { date: string; avg_kw: number; peak_kw: number; }
export interface HistoryHourProfile { hour: number; weekday_kw: number; weekend_kw: number; }
export interface HistoryFeeder { feeder: string; name: string; avg_kw: number; }
export interface HistoryReport {
  period_start: string;
  period_end: string;
  days: number;
  peak_kw: number;
  peak_time: string;
  avg_kw: number;
  total_kwh: number;
  source: string;
  daily: HistoryDaily[];
  profile: HistoryHourProfile[];
  feeders: HistoryFeeder[];
}

// ---------- EUI 用電強度 ----------
export interface BuildingEUI {
  letter: string;
  name: string;
  floor_area_m2: number;
  load_kw: number;
  annual_kwh: number;
  eui: number;
  area_reliable: boolean;   // false=面積偏小,EUI 僅供參考
}

export interface EUIReport {
  year: number;
  campus_eui: number;
  campus_annual_kwh: number;
  total_floor_area_m2: number;
  benchmark: number;
  buildings: BuildingEUI[];
}

// ---------- 契約容量最佳化 (殺手功能) ----------
export interface MeasuredMonthPeak {
  month: string;            // "2023-06"
  peak_kw: number;
  overshoot_kw: number;     // max(0, 實測尖峰 - 現況契約)
  penalty_nt: number;       // 該月實測超約罰款
}

export interface ContractCurvePoint {
  contract_kw: number;
  basic_nt: number;         // 基本電費 (整年 12 月)
  penalty_nt: number;       // 全年超約罰款
  total_nt: number;         // 年總成本
}

export interface ContractOptimization {
  rate_nt_per_kw: number;
  high_months: number;      // 假設:全年高需量月數
  offseason_ratio: number;  // 假設:離峰季尖峰 / 夏季尖峰
  summer_peak_kw: number;   // 尖峰錨點 (EMS 實測)
  measured: MeasuredMonthPeak[];
  current_contract_kw: number;
  current_annual_nt: number;
  current_penalty_nt: number;
  recommended_contract_kw: number;
  recommended_annual_nt: number;
  recommended_penalty_nt: number;
  annual_savings_nt: number;     // 純調契約估省
  peakshave_savings_nt: number;  // 削峰至契約內可省 (= 現況全年罰款)
  curve: ContractCurvePoint[];
  note: string;
}

// ---------- 時間電價 月電費試算 ----------
export interface TariffRates {
  summer_peak_kwh: number;
  summer_midpeak_kwh: number;
  summer_offpeak_kwh: number;
  nonsummer_midpeak_kwh: number;
  nonsummer_offpeak_kwh: number;
  basic_summer_kw: number;
  basic_nonsummer_kw: number;
}

export interface TariffInfo {
  rates: TariffRates;
  window_note: string;
}

export interface BillRequest {
  month: string;                  // "YYYY-MM"
  contract_capacity_kw: number;
  rates?: TariffRates;
}

export interface BillPeriodLine {
  period: string;                 // 尖峰/半尖峰/離峰
  kwh: number;
  rate: number;
  charge: number;
  peak_kw: number;
}

export interface MonthlyBill {
  month: string;
  season: string;                 // 夏月 / 非夏月
  contract_capacity_kw: number;
  energy_lines: BillPeriodLine[];
  energy_charge: number;
  basic_rate: number;
  basic_charge: number;
  peak_kw: number;
  overshoot_kw: number;
  overshoot_penalty: number;
  total: number;
  window_note: string;
}
