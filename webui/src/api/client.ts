// 極簡 API client。開發時 /api 由 Vite proxy 轉到後端 (見 vite.config.ts)。
import type {
  BuildingDetail,
  BuildingSummary,
  DashboardSummary,
  FeederDetail,
  PowerFlowResult,
  ScenarioComparison,
  ScenarioRequest,
  TopologyGraph,
  TransformerDetail,
  VcbDetail,
} from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
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
  vcbs: () => get<VcbDetail[]>("/api/assets/vcbs"),
  feeders: () => get<FeederDetail[]>("/api/assets/feeders"),
  feeder: (id: string) => get<FeederDetail>(`/api/assets/feeders/${encodeURIComponent(id)}`),
  topology: () => get<TopologyGraph>("/api/topology"),
  powerflow: () => get<PowerFlowResult>("/api/powerflow"),
  runScenario: (req: ScenarioRequest) => post<ScenarioComparison>("/api/scenario/run", req),
};
