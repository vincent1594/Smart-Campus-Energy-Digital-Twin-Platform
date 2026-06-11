import { Alert, Card, Col, Input, List, Row, Segmented, Space, Spin, Tabs, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, DashboardSummary, PowerFlowResult, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import FocusPanel from "../components/FocusPanel";
import LoadRatioTag from "../components/LoadRatioTag";
import { type FocusKind, useFocus } from "../focus/FocusContext";
import { SOURCE_KEY, buildingLetter } from "../lib/campusPositions";

const statusMap: Record<string, { type: "success" | "warning" | "error"; text: string }> = {
  OK: { type: "success", text: "系統正常 — 無越限" },
  WARNING: { type: "warning", text: "注意 — 有設備或電壓越限" },
  ERROR: { type: "error", text: "嚴重 — 有孤島或未供電負載" },
};

export default function MapExplorer() {
  const { focus, setFocus } = useFocus();
  const [mode, setMode] = useState<"supply" | "impact">("supply");
  const [dash, setDash] = useState<DashboardSummary>();
  const [pf, setPf] = useState<PowerFlowResult>();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string>();

  useEffect(() => {
    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers()])
      .then(([d, p, b, t]) => { setDash(d); setPf(p); setBuildings(b); setTrafos(t); })
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
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      if (!zones.has(L)) { zones.set(L, { name: b.name.replace(/\s*\(.*\)/, ""), ratio: null }); repLoadByLetter.set(L, b.id); }
      const t = trafoByName.get(b.transformer_name);
      const r = t?.load_ratio_percent ?? null;
      if (r != null) { const z = zones.get(L)!; z.ratio = Math.max(z.ratio ?? 0, r); }
      push(lettersByTrafo, b.transformer_name, L);
      push(lettersByFeeder, t?.feeder_id, L);
      if (t?.vcb_id) { push(lettersByVcb, t.vcb_id, L); if (!vcbOfLetter.has(L)) vcbOfLetter.set(L, t.vcb_id); }
    }
    return { zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, repLoadByLetter };
  }, [buildings, trafoByName]);

  const markers: MapMarker[] = useMemo(() => [...zones.entries()].map(([letter, z]) => ({ letter, name: z.name, ratio: z.ratio })), [zones]);

  const { focusLetter, highlight } = useMemo(() => {
    const empty = new Set<string>();
    if (!focus) return { focusLetter: null as string | null, highlight: empty };
    if (focus.kind === "source") return { focusLetter: SOURCE_KEY, highlight: new Set(zones.keys()) };
    if (focus.kind === "building") {
      const L = buildingLetter(focus.id);
      return { focusLetter: L, highlight: lettersByVcb.get(vcbOfLetter.get(L) ?? "") ?? empty };
    }
    if (focus.kind === "transformer") return { focusLetter: null, highlight: lettersByTrafo.get(focus.id) ?? empty };
    if (focus.kind === "feeder") return { focusLetter: null, highlight: lettersByFeeder.get(focus.id) ?? empty };
    return { focusLetter: null, highlight: lettersByVcb.get(focus.id) ?? empty };
  }, [focus, zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter]);

  const onMapSelect = (letter: string) => {
    if (letter === SOURCE_KEY) { setFocus({ kind: "source", id: SOURCE_KEY, label: "台電受電站(X棟)" }); return; }
    if (mode === "supply") { const rep = repLoadByLetter.get(letter); if (rep) setFocus({ kind: "building", id: rep, label: `${letter}棟` }); }
    else { const v = vcbOfLetter.get(letter); if (v) setFocus({ kind: "vcb", id: v, label: trafos.find((t) => t.vcb_id === v)?.vcb_name ?? v }); }
  };

  const alerts = useMemo(() => {
    if (!pf) return [];
    const out: { level: string; kind: FocusKind; id: string; label: string; msg: string }[] = [];
    pf.transformer_loadings.filter((t) => t.load_ratio_percent >= 80).forEach((t) => out.push({ level: t.load_ratio_percent > 100 ? "警告" : "注意", kind: "transformer", id: t.transformer_id, label: t.transformer_name, msg: `負載率 ${t.load_ratio_percent.toFixed(0)}%` }));
    pf.feeder_loadings.filter((f) => f.load_ratio_percent >= 80).forEach((f) => out.push({ level: f.load_ratio_percent > 100 ? "警告" : "注意", kind: "feeder", id: f.feeder_id, label: f.feeder_name, msg: `饋線 ${f.load_ratio_percent.toFixed(0)}%` }));
    pf.building_voltages.filter((b) => b.voltage_pu < 0.95).forEach((b) => out.push({ level: "注意", kind: "building", id: b.building_id, label: b.building_name, msg: `電壓 ${b.voltage_pu.toFixed(3)}pu` }));
    return out;
  }, [pf]);

  if (err) return <Alert type="error" message="無法載入" description={err} showIcon />;
  if (!dash || !pf) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;
  const s = statusMap[dash.status] ?? statusMap.OK;

  const buildingList = buildings.filter((b) => !q || b.name.includes(q) || b.id.includes(q));

  return (
    <>
      <Alert type={s.type} showIcon style={{ marginBottom: 12 }}
        message={<Space size={16}><b>系統狀態:{dash.status}</b><span>{s.text}</span><span>· 告警 {alerts.length}</span><span>· 總負載 {dash.total_load_kw} kW</span><span>· 最低電壓 {dash.min_voltage_pu} pu</span></Space>} />

      <Row gutter={12}>
        {/* 左:探索清單 */}
        <Col xs={24} lg={5}>
          <Card size="small" styles={{ body: { padding: 8 } }}>
            <Tabs size="small" items={[
              {
                key: "b", label: "建築", children: (
                  <>
                    <Input.Search size="small" placeholder="搜尋建築" allowClear onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
                    <List size="small" dataSource={buildingList} style={{ maxHeight: 560, overflow: "auto" }}
                      renderItem={(b) => (
                        <List.Item style={{ cursor: "pointer", padding: "6px 4px" }} onClick={() => setFocus({ kind: "building", id: b.id, label: b.name })}>
                          <span style={{ fontSize: 13 }}>{b.name}</span>
                          <span style={{ color: "#999", fontSize: 12 }}>{b.estimated_load_kw}kW</span>
                        </List.Item>
                      )} />
                  </>
                ),
              },
              {
                key: "t", label: "設備", children: (
                  <List size="small" style={{ maxHeight: 600, overflow: "auto" }}
                    dataSource={[...trafos].sort((a, b) => (b.load_ratio_percent ?? 0) - (a.load_ratio_percent ?? 0))}
                    renderItem={(t) => (
                      <List.Item style={{ cursor: "pointer", padding: "6px 4px" }} onClick={() => setFocus({ kind: "transformer", id: t.id, label: t.name })}>
                        <span style={{ fontSize: 13 }}>{t.name}</span>
                        <LoadRatioTag ratio={t.load_ratio_percent} />
                      </List.Item>
                    )} />
                ),
              },
              {
                key: "a", label: `告警(${alerts.length})`, children: (
                  <List size="small" style={{ maxHeight: 600, overflow: "auto" }} dataSource={alerts}
                    locale={{ emptyText: "無告警" }}
                    renderItem={(a) => (
                      <List.Item style={{ cursor: "pointer", padding: "6px 4px" }} onClick={() => setFocus({ kind: a.kind, id: a.id, label: a.label })}>
                        <Space direction="vertical" size={0}>
                          <span style={{ fontSize: 13 }}><Tag color={a.level === "警告" ? "orange" : "blue"}>{a.level}</Tag>{a.label}</span>
                          <span style={{ color: "#999", fontSize: 12 }}>{a.msg}</span>
                        </Space>
                      </List.Item>
                    )} />
                ),
              },
            ]} />
          </Card>
        </Col>

        {/* 中:大地圖 */}
        <Col xs={24} lg={13}>
          <Card size="small" styles={{ body: { padding: 8 } }}
            title={<>校園供電地圖 <Tag color="geekblue">北電錶系統</Tag></>}
            extra={<Segmented size="small" value={mode} onChange={(v) => setMode(v as "supply" | "impact")}
              options={[{ label: "查供電路徑", value: "supply" }, { label: "看停電影響", value: "impact" }]} />}>
            <CampusMapStatic markers={markers} focusLetter={focusLetter} highlight={highlight} onSelect={onMapSelect} />
            <div style={{ marginTop: 6, fontSize: 12, color: "#999" }}>
              {mode === "supply" ? "點建築 → 高亮同一 VCB 供電群,右側顯示供電路徑與該棟變壓器" : "點建築 → 高亮該 VCB 供電的所有建築(停電影響範圍)"}
            </div>
          </Card>
        </Col>

        {/* 右:焦點面板 */}
        <Col xs={24} lg={6}>
          <Card size="small" title="焦點詳情" style={{ height: "100%" }}>
            <FocusPanel buildings={buildings} trafos={trafos} dash={dash} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
