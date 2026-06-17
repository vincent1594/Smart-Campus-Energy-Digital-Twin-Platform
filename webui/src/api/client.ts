// 極簡 API client。開發時 /api 由 Vite proxy 轉到後端 (見 vite.config.ts)。
import type {
  BuildingDetail,
  BuildingSummary,
  DashboardSummary,
  FeederDetail,
  PowerFlowResult,
  ForecastRequest,
  ScenarioComparison,
  ScenarioRequest,
  TopologyGraph,
  TransformerDetail,
  TransformerSpec,
  VcbDetail,
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
  vcbs: () => get<VcbDetail[]>("/api/assets/vcbs"),
  feeders: () => get<FeederDetail[]>("/api/assets/feeders"),
  feeder: (id: string) => get<FeederDetail>(`/api/assets/feeders/${encodeURIComponent(id)}`),
  topology: () => get<TopologyGraph>("/api/topology"),
  powerflow: () => get<PowerFlowResult>("/api/powerflow"),
  runScenario: (req: ScenarioRequest) => post<ScenarioComparison>("/api/scenario/run", req),
  runForecast: (req: ForecastRequest) => post<ScenarioComparison>("/api/scenario/forecast", req),
};
