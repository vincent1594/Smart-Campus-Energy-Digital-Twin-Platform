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
  FeedbackList,
  FeedbackResult,
  MyFeedback,
  FeederDetail,
  HistoryReport,
  MonthlyBill,
  TariffInfo,
  PowerFlowResult,
  ForecastRequest,
  RecentVisit,
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

// ── 多電網:當前選定的電網 (北/南),持久化於 localStorage ──
// 網路相關端點路徑為 /api/{network}/...;全域端點 (visit/feedback/settings/health/networks) 不帶網路。
let currentNetwork = (typeof localStorage !== "undefined" && localStorage.getItem("network")) || "north";

export function getNetwork(): string {
  return currentNetwork;
}

export function setNetwork(id: string): void {
  currentNetwork = id;
  if (typeof localStorage !== "undefined") localStorage.setItem("network", id);
}

// 網路範圍端點前綴:在呼叫當下取用 currentNetwork
const napi = (path: string) => `/api/${currentNetwork}${path}`;

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

async function put<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
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
  // 可切換的電網清單 (全域;供南/北切換器)
  networks: () => get<{ id: string; name: string }[]>("/api/networks"),
  // ── 以下為「網路範圍」端點:路徑帶 /api/{network}/... ──
  dashboard: () => get<DashboardSummary>(napi("/dashboard")),
  buildings: (query?: string) =>
    get<BuildingSummary[]>(napi(`/buildings${query ? `?query=${encodeURIComponent(query)}` : ""}`)),
  // 指定電網版 (不依當前 currentNetwork):供「全校園」總覽同時抓南北兩網
  buildingsOf: (net: string) => get<BuildingSummary[]>(`/api/${net}/buildings`),
  powerflowOf: (net: string) => get<PowerFlowResult>(`/api/${net}/powerflow`),
  building: (id: string) => get<BuildingDetail>(napi(`/buildings/${encodeURIComponent(id)}`)),
  transformers: () => get<TransformerDetail[]>(napi("/assets/transformers")),
  transformer: (id: string) => get<TransformerDetail>(napi(`/assets/transformers/${encodeURIComponent(id)}`)),
  transformerSpecs: () => get<TransformerSpec[]>(napi("/assets/transformer-specs")),
  replacementPriority: () => get<TransformerRisk[]>(napi("/assets/replacement-priority")),
  replacementEconomics: (unitPrice?: number, energyPrice?: number) => {
    const q = new URLSearchParams();
    if (unitPrice != null) q.set("unit_price", String(unitPrice));
    if (energyPrice != null) q.set("energy_price", String(energyPrice));
    const s = q.toString();
    return get<ReplacementEconomicsReport>(napi(`/assets/replacement-economics${s ? `?${s}` : ""}`));
  },
  vcbs: () => get<VcbDetail[]>(napi("/assets/vcbs")),
  feeders: () => get<FeederDetail[]>(napi("/assets/feeders")),
  feeder: (id: string) => get<FeederDetail>(napi(`/assets/feeders/${encodeURIComponent(id)}`)),
  topology: () => get<TopologyGraph>(napi("/topology")),
  powerflow: () => get<PowerFlowResult>(napi("/powerflow")),
  runScenario: (req: ScenarioRequest) => post<ScenarioComparison>(napi("/scenario/run"), req),
  runForecast: (req: ForecastRequest) => post<ScenarioComparison>(napi("/scenario/forecast"), req),
  // 日曲線尖峰日 24h 快照:北網有預算好的靜態檔 (瞬間);其餘網走 API (未備則後端回 404)
  forecastDay: async (): Promise<{ date: string; peak_hour: number; snapshots: PowerFlowResult[] }> => {
    type FD = { date: string; peak_hour: number; snapshots: PowerFlowResult[] };
    if (currentNetwork === "north") {
      try {
        const r = await fetch("/forecast-day.json");
        if (r.ok) return (await r.json()) as FD;
      } catch { /* 靜態檔讀取失敗 → 退回 API */ }
    }
    return get<FD>(napi("/scenario/forecast-day"));
  },
  demand: (contractKw?: number, rate?: number) => {
    const q = new URLSearchParams();
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    const s = q.toString();
    return get<DemandStatus>(napi(`/demand/${s ? `?${s}` : ""}`));
  },
  demandForecast: (date: string, contractKw?: number, rate?: number) => {
    const q = new URLSearchParams({ date });
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    return get<DemandForecast>(napi(`/demand/forecast?${q.toString()}`));
  },
  contractOptimize: (contractKw?: number, rate?: number, highMonths?: number, offseasonRatio?: number) => {
    const q = new URLSearchParams();
    if (contractKw != null) q.set("contract_kw", String(contractKw));
    if (rate != null) q.set("rate", String(rate));
    if (highMonths != null) q.set("high_months", String(highMonths));
    if (offseasonRatio != null) q.set("offseason_ratio", String(offseasonRatio));
    const s = q.toString();
    return get<ContractOptimization>(napi(`/demand/optimize${s ? `?${s}` : ""}`));
  },
  eui: (year?: number) => get<EUIReport>(napi(`/eui${year ? `?year=${year}` : ""}`)),
  history: () => get<HistoryReport>(napi("/history")),
  tariff: () => get<TariffInfo>(napi("/demand/tariff")),
  bill: (req: BillRequest) => post<MonthlyBill>(napi("/demand/bill"), req),
  // ── 以下為全域端點 (不帶網路) ──
  recordVisit: (visitorId: string) => post<VisitStats>("/api/visit", { visitor_id: visitorId }),
  visitStats: () => get<VisitStats>("/api/visit/stats"),
  recentVisits: (limit = 30) => get<RecentVisit[]>(`/api/visit/recent?limit=${limit}`),
  submitFeedback: (visitorId: string, rating: number, comment: string, role: string) =>
    post<FeedbackResult>("/api/feedback", { visitor_id: visitorId, rating, comment, role }),
  myFeedback: (visitorId: string) => get<MyFeedback | null>(`/api/feedback/mine?visitor_id=${encodeURIComponent(visitorId)}`),
  feedbackList: (limit = 100) => get<FeedbackList>(`/api/feedback?limit=${limit}`),
  health: () => get<{ status: string }>("/api/health"),
  getSettings: () => get<Record<string, unknown>>("/api/settings"),
  putSettings: (values: Record<string, unknown>, by = "") => put<Record<string, unknown>>("/api/settings", { values, by }),
};
