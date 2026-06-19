// 極簡 API client。開發時 /api 由 Vite proxy 轉到後端 (見 vite.config.ts)。
import type {
  BillRequest,
  BuildingDetail,
  BuildingSummary,
  ContractOptimization,
  DashboardSummary,
  DemandForecast,
  DemandStatus,
  EUIReport,
  FeederDetail,
  HistoryReport,
  MonthlyBill,
  TariffInfo,
  PowerFlowResult,
  ForecastRequest,
  ReplacementEconomicsReport,
  ScenarioComparison,
  ScenarioRequest,
  TopologyGraph,
  TransformerDetail,
  TransformerRisk,
  TransformerSpec,
  VcbDetail,
  VisitStats,
} from "./types";
// 開發時用相對路徑 → 由 Vite proxy 轉到本機後端 (127.0.0.1:8126);正式版打 Render
const API_BASE_URL = import.meta.env.DEV ? "" : "https://smart-campus-energy-digital-twin.onrender.com";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => get<DashboardSummary>("/api/dashboard"),
  buildings: (query?: string) =>
    get<BuildingSummary[]>(`/api/buildings${query ? `?query=${encodeURIComponent(query)}` : ""}`),
  building: (id: string) => get<BuildingDetail>(`/api/buildings/${encodeURIComponent(id)}`),
  transformers: () => get<TransformerDetail[]>("/api/assets/transformers"),
  transformer: (id: string) => get<TransformerDetail>(`/api/assets/transformers/${encodeURIComponent(id)}`),
  transformerSpecs: () => get<TransformerSpec[]>("/api/assets/transformer-specs"),
  replacementPriority: () => get<TransformerRisk[]>("/api/assets/replacement-priority"),
  replacementEconomics: (unitPrice?: number, energyPrice?: number) => {
    const q = new URLSearchParams();
    if (unitPrice != null) q.set("unit_price", String(unitPrice));
    if (energyPrice != null) q.set("energy_price", String(energyPrice));
    const s = q.toString();
    return get<ReplacementEconomicsReport>(`/api/assets/replacement-economics${s ? `?${s}` : ""}`);
  },
  vcbs: () => get<VcbDetail[]>("/api/assets/vcbs"),
  feeders: () => get<FeederDetail[]>("/api/assets/feeders"),
  feeder: (id: string) => get<FeederDetail>(`/api/assets/feeders/${encodeURIComponent(id)}`),
  topology: () => get<TopologyGraph>("/api/topology"),
  powerflow: () => get<PowerFlowResult>("/api/powerflow"),
  runScenario: (req: ScenarioRequest) => post<ScenarioComparison>("/api/scenario/run", req),
  runForecast: (req: ForecastRequest) => post<ScenarioComparison>("/api/scenario/forecast", req),
  demand: (contractKw?: number, rate?: number) => {
    const q = new URLSearchParams();
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    const s = q.toString();
    return get<DemandStatus>(`/api/demand/${s ? `?${s}` : ""}`);
  },
  demandForecast: (date: string, contractKw?: number, rate?: number) => {
    const q = new URLSearchParams({ date });
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    return get<DemandForecast>(`/api/demand/forecast?${q.toString()}`);
  },
  contractOptimize: (contractKw?: number, rate?: number, highMonths?: number, offseasonRatio?: number) => {
    const q = new URLSearchParams();
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    if (highMonths != null) q.set("high_months", String(highMonths));
    if (offseasonRatio != null) q.set("offseason_ratio", String(offseasonRatio));
    const s = q.toString();
    return get<ContractOptimization>(`/api/demand/optimize${s ? `?${s}` : ""}`);
  },
  eui: (year?: number) => get<EUIReport>(`/api/eui${year ? `?year=${year}` : ""}`),
  history: () => get<HistoryReport>("/api/history"),
  tariff: () => get<TariffInfo>("/api/demand/tariff"),
  bill: (req: BillRequest) => post<MonthlyBill>("/api/demand/bill", req),
  recordVisit: (visitorId: string) => post<VisitStats>("/api/visit", { visitor_id: visitorId }),
  visitStats: () => get<VisitStats>("/api/visit/stats"),
  health: () => get<{ status: string }>("/api/health"),
};
