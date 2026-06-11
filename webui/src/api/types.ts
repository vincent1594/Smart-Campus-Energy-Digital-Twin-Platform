// 後端 DTO 的 TS 鏡像。欄位皆為業務語意,無 pandapower 原始欄位名。

export interface DashboardSummary {
  building_count: number;
  transformer_count: number;
  feeder_count: number;
  vcb_count: number;
  total_load_kw: number;
  system_loss_kw: number;
  min_voltage_pu: number;
  max_transformer_load_ratio_percent: number;
  max_feeder_load_ratio_percent: number;
  status: string; // OK / WARNING / ERROR
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
  estimated_load_kw: number;
  feeder_name: string;
  transformer_name: string;
}

export interface BuildingDetail {
  id: string;
  name: string;
  estimated_load_kw: number;
  power_factor: number;
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
  system_loss_kw: number;
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
