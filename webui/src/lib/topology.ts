import { Position, type Edge, type Node } from "reactflow";
import type { PowerFlowResult, TopologyGraph } from "../api/types";

const KIND_X: Record<string, number> = { source: 0, vcb: 1, feeder: 2, transformer: 3, building: 4 };
const COL_GAP = 240;
const ROW_GAP = 56;

function ratioColor(ratio: number | null | undefined): { bg: string; border: string } {
  if (ratio == null) return { bg: "#f0f0f0", border: "#bfbfbf" };
  if (ratio > 100) return { bg: "#fff1f0", border: "#ff4d4f" };
  if (ratio >= 80) return { bg: "#fff7e6", border: "#fa8c16" };
  return { bg: "#f6ffed", border: "#52c41a" };
}

const KIND_STYLE: Record<string, { bg: string; border: string }> = {
  source: { bg: "#001529", border: "#001529" },
  vcb: { bg: "#e6f4ff", border: "#1677ff" },
  feeder: { bg: "#f9f0ff", border: "#9254de" },
  building: { bg: "#fafafa", border: "#8c8c8c" },
};

// 把拓樸圖 + 潮流負載率組成 React Flow 的 nodes/edges。
// 用 DFS 前序決定各層垂直順序,讓子節點靠近父節點;變壓器/饋線依負載率上色。
export function buildFlow(graph: TopologyGraph, pf?: PowerFlowResult): { nodes: Node[]; edges: Edge[] } {
  const trafoRatio = new Map(pf?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
  const feederRatio = new Map(pf?.feeder_loadings.map((f) => [f.feeder_id, f.load_ratio_percent]) ?? []);

  const adj = new Map<string, string[]>();
  graph.nodes.forEach((n) => adj.set(n.id, []));
  graph.edges.forEach((e) => adj.get(e.source)?.push(e.target));

  const order: string[] = [];
  const seen = new Set<string>();
  const dfs = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    (adj.get(id) ?? []).forEach(dfs);
  };
  dfs("SOURCE");
  graph.nodes.forEach((n) => !seen.has(n.id) && dfs(n.id));

  const yIdx: Record<string, number> = { source: 0, vcb: 0, feeder: 0, transformer: 0, building: 0 };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const nodes: Node[] = order.map((id) => {
    const n = byId.get(id)!;
    const k = n.kind;
    let color = KIND_STYLE[k] ?? { bg: "#fff", border: "#999" };
    if (k === "transformer") color = ratioColor(trafoRatio.get(id));
    if (k === "feeder") color = ratioColor(feederRatio.get(id));
    const ratio = k === "transformer" ? trafoRatio.get(id) : k === "feeder" ? feederRatio.get(id) : undefined;
    return {
      id,
      position: { x: KIND_X[k] * COL_GAP, y: (yIdx[k]++) * ROW_GAP },
      data: { label: ratio != null ? `${n.label}\n${ratio.toFixed(0)}%` : n.label, kind: k },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: color.bg,
        border: `2px solid ${color.border}`,
        borderRadius: 6,
        fontSize: 11,
        width: 150,
        padding: 6,
        whiteSpace: "pre-line" as const,
        color: k === "source" ? "#fff" : "#000",
      },
    };
  });

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    style: { stroke: "#bfbfbf" },
  }));

  return { nodes, edges };
}
