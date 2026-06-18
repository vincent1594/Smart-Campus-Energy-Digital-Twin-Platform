// 純 SVG 高壓配電單線圖(不依賴 reactflow):分層 台電→VCB→饋線→變壓器→建築,
// 依負載率上色、點擊回呼。用 viewBox 自動縮放填滿容器(整圖一個畫面、不捲動)。
// 點選任一節點 → 高亮它的整條供電關係(向上溯源 + 向下所屬),其餘淡化,讓關係清楚。
// 縮小後字較小,故每個節點加 <title> 滑鼠懸停顯示完整名稱與負載率。
import type { PowerFlowResult, TopologyGraph } from "../api/types";

export interface PickedNode { kind: string; id: string }

const COLX: Record<string, number> = { source: 8, vcb: 168, feeder: 326, transformer: 484, building: 642 };
const NODEW: Record<string, number> = { source: 150, vcb: 150, feeder: 150, transformer: 150, building: 172 };
const NODEH = 22;
const ROWGAP = 26;
const PADTOP = 18;

function ratioColor(ratio?: number | null): { bg: string; border: string } {
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

export default function SingleLineSvg({ graph, pf, selectedId, onSelect }: {
  graph: TopologyGraph;
  pf?: PowerFlowResult;
  selectedId?: string | null;
  onSelect: (n: PickedNode) => void;
}) {
  const trafo = new Map(pf?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
  const feederR = new Map(pf?.feeder_loadings.map((f) => [f.feeder_id, f.load_ratio_percent]) ?? []);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const adj = new Map<string, string[]>();
  graph.nodes.forEach((n) => adj.set(n.id, []));
  graph.edges.forEach((e) => adj.get(e.source)?.push(e.target));
  const parent = new Map<string, string>();
  graph.edges.forEach((e) => parent.set(e.target, e.source));

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

  // 選中節點 → 相關集合(祖先鏈 + 自己 + 子孫子樹),用來高亮整條供電關係
  let related: Set<string> | null = null;
  if (selectedId && byId.has(selectedId)) {
    related = new Set<string>([selectedId]);
    let cur = parent.get(selectedId);
    while (cur) { related.add(cur); cur = parent.get(cur); }
    const st = [selectedId];
    while (st.length) {
      const x = st.pop() as string;
      (adj.get(x) ?? []).forEach((c) => { if (!related!.has(c)) { related!.add(c); st.push(c); } });
    }
  }

  const yIdx: Record<string, number> = { source: 0, vcb: 0, feeder: 0, transformer: 0, building: 0 };
  const pos = new Map<string, { x: number; y: number; w: number; k: string; ratio?: number | null; label: string }>();
  order.forEach((id) => {
    const n = byId.get(id);
    if (!n) return;
    const k = n.kind;
    const ratio = k === "transformer" ? trafo.get(id) : k === "feeder" ? feederR.get(id) : undefined;
    const row = yIdx[k] ?? 0;
    yIdx[k] = row + 1;
    pos.set(id, { x: COLX[k] ?? 0, y: PADTOP + row * ROWGAP, w: NODEW[k] ?? 150, k, ratio, label: n.label });
  });

  const maxRows = Math.max(1, ...Object.values(yIdx));
  const height = PADTOP * 2 + maxRows * ROWGAP;
  const width = COLX.building + NODEW.building + 12;

  const COL_TITLE: { x: number; t: string }[] = [
    { x: COLX.source, t: "台電進線" }, { x: COLX.vcb, t: "VCB" }, { x: COLX.feeder, t: "饋線" },
    { x: COLX.transformer, t: "變壓器" }, { x: COLX.building, t: "建築" },
  ];

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", border: "1px solid #f0f0f0", borderRadius: 8, background: "#fff" }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: "block" }}>
        {COL_TITLE.map((c) => (
          <text key={c.t} x={c.x} y={11} fontSize={11} fontWeight={600} fill="#999">{c.t}</text>
        ))}
        {/* 連線:選中時其供電關係鏈高亮藍、其餘淡灰 */}
        {graph.edges.map((e) => {
          const s = pos.get(e.source); const t = pos.get(e.target);
          if (!s || !t) return null;
          const active = related ? related.has(e.source) && related.has(e.target) : false;
          const sx = s.x + s.w; const sy = s.y + NODEH / 2; const tx = t.x; const ty = t.y + NODEH / 2;
          const mx = (sx + tx) / 2;
          return <path key={e.id} d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`} fill="none"
            stroke={active ? "#1677ff" : related ? "#ececec" : "#d0d0d0"} strokeWidth={active ? 1.8 : 0.8} />;
        })}
        {/* 節點:選中時非相關者淡化 */}
        {order.map((id) => {
          const p = pos.get(id);
          if (!p) return null;
          const col = p.k === "transformer" || p.k === "feeder" ? ratioColor(p.ratio) : (KIND_STYLE[p.k] ?? { bg: "#fff", border: "#999" });
          const sel = id === selectedId;
          const dim = related ? !related.has(id) : false;
          const label = p.ratio != null ? `${p.label}  ${p.ratio.toFixed(0)}%` : p.label;
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} opacity={dim ? 0.28 : 1} onClick={() => onSelect({ kind: p.k, id })}>
              <title>{p.ratio != null ? `${p.label}（負載率 ${p.ratio.toFixed(0)}%）` : p.label}</title>
              <rect width={p.w} height={NODEH} rx={4} fill={col.bg} stroke={sel ? "#1677ff" : col.border} strokeWidth={sel ? 2.5 : 1.2} />
              <text x={6} y={NODEH / 2 + 1} dominantBaseline="middle" fontSize={11} fill={p.k === "source" ? "#fff" : "#000"} style={{ pointerEvents: "none" }}>
                {label.length > 22 ? `${label.slice(0, 21)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
