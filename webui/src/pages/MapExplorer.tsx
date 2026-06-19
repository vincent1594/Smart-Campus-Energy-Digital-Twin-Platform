import { Alert, Card, Segmented, Spin, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BuildingSummary, DashboardSummary, PowerFlowResult, TopologyGraph, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import FocusPanel from "../components/FocusPanel";
import SingleLineSvg from "../components/SingleLineSvg";
import StatsPanel from "../components/StatsPanel";
import { useFocus, type FocusKind } from "../focus/FocusContext";
import { SOURCE_KEY, buildingLetter } from "../lib/campusPositions";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import { useTheme } from "../theme/ThemeContext";


export default function MapExplorer() {
  const navigate = useNavigate();
  const { focus, setFocus } = useFocus();
  const { scenario, setScenario } = useActiveScenario();
  const { dark } = useTheme();
  const [mode, setMode] = useState<"supply" | "impact">("supply");
  const [centerView, setCenterView] = useState<"map" | "single">("map");
  const [dash, setDash] = useState<DashboardSummary>();
  const [pf, setPf] = useState<PowerFlowResult>();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const [graph, setGraph] = useState<TopologyGraph>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers(), api.topology()])
      .then(([d, p, b, t, g]) => { setDash(d); setPf(p); setBuildings(b); setTrafos(t); setGraph(g); })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const trafoByName = useMemo(() => new Map(trafos.map((t) => [t.name, t])), [trafos]);

  const { zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, repLoadByLetter } = useMemo(() => {
    const zones = new Map<string, { name: string; ratio: number | null }>();
    const lettersByVcb = new Map<string, Set<string>>();
    const lettersByTrafo = new Map<string, Set<string>>();
    const lettersByFeeder = new Map<string, Set<string>>();
    const vcbOfLetter = new Map<string, string>();
    const repLoadByLetter = new Map<string, string>();
    const push = (m: Map<string, Set<string>>, k: string | null | undefined, L: string) => { if (k) (m.get(k) ?? m.set(k, new Set()).get(k)!).add(L); };
    // 負載率來源:有套用情境用情境結果,否則用現況潮流
    const result = scenario ?? pf;
    const ratioById = new Map(result?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      if (!zones.has(L)) { zones.set(L, { name: b.name.replace(/\s*\(.*\)/, ""), ratio: null }); repLoadByLetter.set(L, b.id); }
      const t = trafoByName.get(b.transformer_name);
      const r = ratioById.get(b.transformer_name) ?? null;
      if (r != null) { const z = zones.get(L)!; z.ratio = Math.max(z.ratio ?? 0, r); }
      push(lettersByTrafo, b.transformer_name, L);
      push(lettersByFeeder, t?.feeder_id, L);
      if (t?.vcb_id) { push(lettersByVcb, t.vcb_id, L); if (!vcbOfLetter.has(L)) vcbOfLetter.set(L, t.vcb_id); }
    }
    return { zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, repLoadByLetter };
  }, [buildings, trafoByName, scenario, pf]);

  const markers: MapMarker[] = useMemo(() => [
    { letter: "X", name: "受電站(X棟)", ratio: null },  // 與其他棟一樣的透明圈;點擊→受電站
    ...[...zones.entries()].map(([letter, z]) => ({ letter, name: z.name, ratio: z.ratio })),
  ], [zones]);

  const { focusLetter, highlight } = useMemo(() => {
    const empty = new Set<string>();
    if (!focus) return { focusLetter: null as string | null, highlight: empty };
    if (focus.kind === "source") return { focusLetter: "X", highlight: new Set(zones.keys()) };
    if (focus.kind === "building") {
      const L = buildingLetter(focus.id);
      return { focusLetter: L, highlight: lettersByVcb.get(vcbOfLetter.get(L) ?? "") ?? empty };
    }
    if (focus.kind === "transformer") return { focusLetter: null, highlight: lettersByTrafo.get(focus.id) ?? empty };
    if (focus.kind === "feeder") return { focusLetter: null, highlight: lettersByFeeder.get(focus.id) ?? empty };
    return { focusLetter: null, highlight: lettersByVcb.get(focus.id) ?? empty };
  }, [focus, zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter]);

  const onMapSelect = (letter: string) => {
    if (letter === "X") { setFocus({ kind: "source", id: SOURCE_KEY, label: "受電站(X棟)" }); return; }
    if (mode === "supply") { const rep = repLoadByLetter.get(letter); if (rep) setFocus({ kind: "building", id: rep, label: `${letter}棟` }); }
    else { const v = vcbOfLetter.get(letter); if (v) setFocus({ kind: "vcb", id: v, label: trafos.find((t) => t.vcb_id === v)?.vcb_name ?? v }); }
  };

  if (err) return <Alert type="error" message="無法載入" description={err} showIcon />;
  if (!dash || !pf) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  const effPf = scenario ?? pf;
  const effDash = scenario ? {
    ...dash, total_load_kw: scenario.total_load_kw, total_load_kvar: scenario.total_load_kvar,
    system_loss_kw: scenario.system_loss_kw, system_loss_kvar: scenario.system_loss_kvar,
    grid_import_kw: scenario.grid_import_kw, grid_import_kvar: scenario.grid_import_kvar,
    min_voltage_pu: scenario.min_voltage_pu, max_transformer_load_ratio_percent: scenario.max_transformer_load_ratio_percent,
    max_feeder_load_ratio_percent: scenario.max_feeder_load_ratio_percent, status: scenario.status,
  } : dash;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {/* V1 範圍/可信度聲明:連到驗證中心 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px", background: "#e6f4ff", border: "1px solid #91caff", borderRadius: 6, fontSize: 11.5, color: "#0958d9", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, background: "#0958d9", color: "#fff", borderRadius: 3, padding: "0 6px", fontSize: 11 }}>V1</span>
        <span style={{ color: "#333" }}>部分數值為規劃估算、模型涵蓋北電錶區。各數據來源與待校正項目請見</span>
        <a style={{ fontWeight: 600 }} onClick={() => navigate("/verify")}>驗證中心 →</a>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px 1fr 360px", gap: 10 }}>
      {/* 左:狀態 + KPI 面板 */}
      <div style={{ height: "100%", overflow: "hidden" }}>
        <StatsPanel dash={effDash} pf={effPf} dark={dark} />
      </div>

      {/* 中:地圖 / 單線圖 切換 */}
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f5f5f5", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{centerView === "map" ? "校園供電地圖" : "高壓配電單線圖"}{" "}
            <Tag color="geekblue" style={{ cursor: "pointer" }} title="點選聚焦 X棟受電站、高亮整個北側系統"
              onClick={() => setFocus({ kind: "source", id: SOURCE_KEY, label: "受電站(X棟)" })}>北電錶系統</Tag>
            {scenario && <Tag color="orange">模擬情境 <a onClick={() => setScenario(null)}>還原現況</a></Tag>}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {centerView === "map" && (
              <Segmented size="small" value={mode} onChange={(v) => setMode(v as "supply" | "impact")}
                options={[{ label: "查供電路徑", value: "supply" }, { label: "看停電影響", value: "impact" }]} />
            )}
            <Segmented size="small" value={centerView} onChange={(v) => setCenterView(v as "map" | "single")}
              options={[{ label: "地圖", value: "map" }, { label: "單線圖", value: "single" }]} />
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center", padding: 8 }}>
          {centerView === "map"
            ? <CampusMapStatic markers={markers} focusLetter={focusLetter} highlight={highlight} onSelect={onMapSelect} onClear={() => setFocus(null)} dark={dark} fitHeight />
            : graph
              ? <SingleLineSvg graph={graph} pf={effPf} selectedId={focus?.id ?? null} onSelect={(n) => setFocus({ kind: n.kind as FocusKind, id: n.id, label: n.id })} />
              : <Spin />}
        </div>
      </div>

      {/* 右:焦點面板 */}
      <Card size="small" title="焦點詳情" style={{ height: "100%", overflow: "hidden" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <FocusPanel buildings={buildings} trafos={trafos} dash={dash} />
      </Card>
      </div>
    </div>
  );
}
