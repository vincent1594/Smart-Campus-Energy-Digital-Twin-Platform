import { Button, Descriptions, Divider, Empty, List, Space, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BuildingDetail, BuildingSummary, DashboardSummary, FeederDetail, SupplyPathNode, TransformerDetail, VcbDetail } from "../api/types";
import { type Focus, useFocus } from "../focus/FocusContext";
import { buildingLetter } from "../lib/campusPositions";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import LoadRatioTag from "./LoadRatioTag";

const kindStep: Record<string, string> = { source: "台電進線", vcb: "VCB", feeder: "饋線", transformer: "變壓器", building: "建築" };

// 未選取時的右欄總覽:負載率最高設備 + 用電最高建築 + 需留意數(皆可點跳焦點)
function OverviewSummary({ buildings, trafos, dash, onPick }: {
  buildings: BuildingSummary[]; trafos: TransformerDetail[]; dash?: DashboardSummary;
  onPick: (f: Focus) => void;
}) {
  const ratioColor = (r: number) => (r > 100 ? "#cf1322" : r >= 80 ? "#fa8c16" : r >= 50 ? "#1677ff" : "#52c41a");

  const topTrafos = useMemo(
    () => [...trafos].filter((t) => t.load_ratio_percent != null)
      .sort((a, b) => (b.load_ratio_percent ?? 0) - (a.load_ratio_percent ?? 0)).slice(0, 5),
    [trafos],
  );
  const topZones = useMemo(() => {
    const m = new Map<string, { letter: string; name: string; load: number; repId: string }>();
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      const z = m.get(L) ?? { letter: L, name: b.name.replace(/\s*\(.*\)/, ""), load: 0, repId: b.id };
      z.load += b.estimated_load_kw; m.set(L, z);
    }
    return [...m.values()].sort((a, b) => b.load - a.load).slice(0, 5);
  }, [buildings]);
  const watch = useMemo(() => trafos.filter((t) => (t.load_ratio_percent ?? 0) >= 80).length, [trafos]);
  const maxZone = topZones[0]?.load || 1;
  const Row = ({ left, right, bar, color, onClick }: { left: ReactNode; right: ReactNode; bar: number; color: string; onClick: () => void }) => (
    <div onClick={onClick} style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "5px 8px", marginBottom: 4, borderRadius: 5, overflow: "hidden", background: "#fafafa", cursor: "pointer" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, bar)}%`, background: `${color}1f` }} />
      <span style={{ position: "relative", color: "#444" }}>{left}</span>
      <span style={{ position: "relative", fontWeight: 600, color }}>{right}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
        <b style={{ fontSize: 15 }}>校園供電總覽</b>
        <span style={{ fontSize: 11, color: "#bbb" }}>點地圖 / 清單看細節</span>
      </div>
      <div style={{ display: "flex", gap: 6, color: "#888", fontSize: 12, marginBottom: 10 }}>
        <span>供電建築 <b style={{ color: "#555" }}>{dash?.substation_count != null ? dash.substation_count + 1 : "—"}</b> 棟</span>
        <span>·</span>
        <span>變壓器 <b style={{ color: "#555" }}>{trafos.length}</b> 台</span>
        {watch > 0 && <><span>·</span><span style={{ color: "#fa8c16" }}>{watch} 台負載 ≥80%</span></>}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#666", margin: "0 0 6px" }}>負載率最高設備</div>
      {topTrafos.map((t) => {
        const r = t.load_ratio_percent ?? 0;
        return <Row key={t.id} bar={r} color={ratioColor(r)} onClick={() => onPick({ kind: "transformer", id: t.id, label: t.name })}
          left={<>{t.name} <span style={{ color: "#aaa" }}>{t.capacity_kva}kVA</span></>} right={`${r.toFixed(0)}%`} />;
      })}

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#666", margin: "12px 0 6px" }}>用電最高建築</div>
      {topZones.map((z) => (
        <Row key={z.letter} bar={(z.load / maxZone) * 100} color="#1677ff" onClick={() => onPick({ kind: "building", id: z.repId, label: `${z.letter}棟` })}
          left={<><b>{z.letter}</b> {z.name.slice(0, 8)}</>} right={`${z.load.toFixed(0)} kW`} />
      ))}
    </div>
  );
}

// 供電路徑:電纜/變壓器/VCB 可點 → 切焦點
function PathView({ nodes, onPick }: { nodes: SupplyPathNode[]; onPick: (f: Focus) => void }) {
  return (
    <List size="small" dataSource={nodes} renderItem={(n) => {
      const clickable = n.kind === "vcb" || n.kind === "feeder" || n.kind === "transformer";
      const extra = n.kind === "feeder"
        ? `${n.length_m?.toFixed(0) ?? "?"}m · ${n.cross_section_mm2 ?? "?"}mm² · ${n.load_ratio_percent?.toFixed(0) ?? "?"}%`
        : n.kind === "transformer"
        ? `${n.capacity_kva ?? "?"}kVA · ${n.load_ratio_percent?.toFixed(0) ?? "?"}%`
        : "";
      return (
        <List.Item style={clickable ? { cursor: "pointer" } : undefined}
          onClick={clickable ? () => onPick({ kind: n.kind as Focus["kind"], id: n.id, label: n.name }) : undefined}>
          <Space size={6}>
            <Tag>{kindStep[n.kind]}</Tag>
            <span>{n.name}</span>
            {extra && <span style={{ color: "#999", fontSize: 12 }}>{extra}</span>}
          </Space>
        </List.Item>
      );
    }} />
  );
}

export default function FocusPanel({ buildings, trafos, dash }: { buildings: BuildingSummary[]; trafos: TransformerDetail[]; dash?: DashboardSummary }) {
  const { focus, setFocus } = useFocus();
  const navigate = useNavigate();
  const [bd, setBd] = useState<BuildingDetail | null>(null);
  const [tr, setTr] = useState<TransformerDetail | null>(null);
  const [fd, setFd] = useState<FeederDetail | null>(null);
  const [vcb, setVcb] = useState<VcbDetail | null>(null);

  const { scenario } = useActiveScenario();
  const sTrafo = useMemo(() => new Map(scenario?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []), [scenario]);
  const sFeeder = useMemo(() => new Map(scenario?.feeder_loadings.map((f) => [f.feeder_id, f.load_ratio_percent]) ?? []), [scenario]);
  const trRatio = (id: string, base: number | null) => (scenario ? sTrafo.get(id) ?? base : base);
  const fdRatio = (id: string, base: number | null) => (scenario ? sFeeder.get(id) ?? base : base);

  const trafoByName = useMemo(() => new Map(trafos.map((t) => [t.name, t])), [trafos]);
  const letterOfTrafo = (name: string) => {
    const b = buildings.find((x) => x.transformer_name === name);
    return b ? buildingLetter(b.id) : "";
  };

  useEffect(() => {
    setBd(null); setTr(null); setFd(null); setVcb(null);
    if (!focus) return;
    if (focus.kind === "building") api.building(focus.id).then(setBd).catch(() => {});
    else if (focus.kind === "transformer") api.transformer(focus.id).then(setTr).catch(() => {});
    else if (focus.kind === "feeder") api.feeder(focus.id).then(setFd).catch(() => {});
    else if (focus.kind === "vcb") api.vcbs().then((vs) => setVcb(vs.find((v) => v.id === focus.id) ?? null));
  }, [focus]);

  if (!focus) return <OverviewSummary buildings={buildings} trafos={trafos} dash={dash} onPick={setFocus} />;

  // ---- 受電站 ----
  if (focus.kind === "source")
    return (
      <Descriptions title="台電受電站(X棟)" bordered column={1} size="small">
        <Descriptions.Item label="進線">台電 11.4kV</Descriptions.Item>
        <Descriptions.Item label="VCB">{dash?.vcb_count ?? "—"} 路(皆於 X棟匯集)</Descriptions.Item>
        <Descriptions.Item label="供電建築">
          {dash?.substation_count != null ? dash.substation_count + 1 : "—"} 棟
          <span style={{ color: "#999", fontSize: 12, marginInlineStart: 4 }}>(含受電站 X棟)</span>
        </Descriptions.Item>
        <Descriptions.Item label="北側總負載">{dash?.total_load_kw ?? "—"} kW</Descriptions.Item>
        <Descriptions.Item label="停電影響">此處停電 → 整個北側系統停電</Descriptions.Item>
      </Descriptions>
    );

  // ---- 建築(棟層級總覽 + 變壓器清單切換)----
  if (focus.kind === "building") {
    const letter = buildingLetter(focus.id);
    const zoneBuildings = buildings.filter((b) => buildingLetter(b.id) === letter);
    const trafoNames = [...new Set(zoneBuildings.map((b) => b.transformer_name))];
    const zoneTrafos = trafoNames.map((n) => trafoByName.get(n)).filter(Boolean) as TransformerDetail[];
    const totalLoad = zoneBuildings.reduce((s, b) => s + b.estimated_load_kw, 0);
    const maxRatio = Math.max(0, ...zoneTrafos.map((t) => trRatio(t.id, t.load_ratio_percent) ?? 0));
    const vcbName = zoneTrafos[0]?.vcb_name ?? "—";
    return (
      <>
        <Space><Tag color="blue">建築</Tag><b style={{ fontSize: 16 }}>{letter}棟</b></Space>
        <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="區域總負載">{totalLoad.toFixed(1)} kW</Descriptions.Item>
          <Descriptions.Item label="最高負載率"><LoadRatioTag ratio={maxRatio} /></Descriptions.Item>
          <Descriptions.Item label="所屬 VCB">{vcbName}</Descriptions.Item>
        </Descriptions>
        <Divider orientation="left" style={{ margin: "8px 0" }}>變壓器(點擊切換)</Divider>
        <List size="small" dataSource={zoneTrafos} renderItem={(t) => (
          <List.Item style={{ cursor: "pointer" }} onClick={() => setFocus({ kind: "transformer", id: t.id, label: t.name })}>
            <span>{t.name}（{t.capacity_kva} kVA）</span>
            <LoadRatioTag ratio={trRatio(t.id, t.load_ratio_percent)} />
          </List.Item>
        )} />
        <Divider orientation="left" style={{ margin: "8px 0" }}>供電路徑</Divider>
        <PathView nodes={(bd?.supply_path ?? []).map((n) => n.kind === "transformer" ? { ...n, load_ratio_percent: trRatio(n.id, n.load_ratio_percent ?? null) } : n.kind === "feeder" ? { ...n, load_ratio_percent: fdRatio(n.id, n.load_ratio_percent ?? null) } : n)} onPick={setFocus} />
        <Button type="primary" ghost size="small" style={{ marginTop: 8 }} onClick={() => navigate("/scenario")}>規劃模擬</Button>
      </>
    );
  }

  // ---- 變壓器 ----
  if (focus.kind === "transformer" && tr) {
    const letter = letterOfTrafo(tr.name);
    return (
      <>
        <Space>
          {letter && <a onClick={() => setFocus({ kind: "building", id: buildings.find((b) => buildingLetter(b.id) === letter)!.id, label: `${letter}棟` })}>← {letter}棟</a>}
          <Tag color="purple">變壓器</Tag><b>{tr.name}</b>
        </Space>
        <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="容量">{tr.capacity_kva} kVA</Descriptions.Item>
          <Descriptions.Item label="一次側額定">11.4 kV<span style={{ color: "#999", fontSize: 12 }}>(允許 {rangeKV(11.4)} kV)</span></Descriptions.Item>
          <Descriptions.Item label="二次側額定">{lvLabel(tr.lv_kv)}<span style={{ color: "#999", fontSize: 12 }}>(允許 {lvRangeLabel(tr.lv_kv)})</span></Descriptions.Item>
          <Descriptions.Item label="型式">{tr.trafo_type}式</Descriptions.Item>
          <Descriptions.Item label="負載率"><LoadRatioTag ratio={trRatio(tr.id, tr.load_ratio_percent)} /></Descriptions.Item>
          <Descriptions.Item label="所屬饋線">
            {tr.feeder_id ? <a onClick={() => setFocus({ kind: "feeder", id: tr.feeder_id!, label: tr.feeder_name ?? tr.feeder_id! })}>{tr.feeder_name}</a> : <Tag>開關耦合</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="所屬 VCB">{tr.vcb_name}</Descriptions.Item>
          <Descriptions.Item label="連接建築">{tr.connected_building_count} 棟 / {tr.total_connected_load_kw} kW</Descriptions.Item>
          <Descriptions.Item label="運轉狀態">{(trRatio(tr.id, tr.load_ratio_percent) ?? 0) > 100 ? <Tag color="red">過載</Tag> : <Tag color="green">正常</Tag>}</Descriptions.Item>
        </Descriptions>
        <Button type="primary" ghost size="small" onClick={() => navigate("/scenario")}>規劃模擬</Button>
      </>
    );
  }

  // ---- 饋線(電纜)----
  if (focus.kind === "feeder" && fd)
    return (
      <Descriptions title={<><Tag color="geekblue">饋線/電纜</Tag>{fd.name}</>} column={1} size="small">
        <Descriptions.Item label="所屬 VCB">{fd.vcb_name}</Descriptions.Item>
        <Descriptions.Item label="線徑">{fd.cross_section_mm2 ?? "—"} mm²</Descriptions.Item>
        <Descriptions.Item label="長度">{fd.length_m.toFixed(0)} m</Descriptions.Item>
        <Descriptions.Item label="負載率"><LoadRatioTag ratio={fdRatio(fd.id, fd.load_ratio_percent)} /></Descriptions.Item>
        <Descriptions.Item label="狀態">{(fdRatio(fd.id, fd.load_ratio_percent) ?? 0) > 100 ? <Tag color="red">過載</Tag> : <Tag color="green">正常</Tag>}</Descriptions.Item>
        <Descriptions.Item label="供電">{fd.transformer_count} 台變壓器 / {fd.connected_building_count} 棟 / {fd.total_connected_load_kw} kW</Descriptions.Item>
      </Descriptions>
    );

  // ---- VCB ----
  if (focus.kind === "vcb" && vcb)
    return (
      <Descriptions title={<><Tag color="cyan">VCB</Tag>{vcb.name}</>} column={1} size="small">
        <Descriptions.Item label="饋線數">{vcb.feeder_count}</Descriptions.Item>
        <Descriptions.Item label="變壓器數">{vcb.transformer_count}</Descriptions.Item>
        <Descriptions.Item label="供電建築">{vcb.connected_building_count} 棟</Descriptions.Item>
        <Descriptions.Item label="合計負載">{vcb.total_connected_load_kw} kW</Descriptions.Item>
        <Descriptions.Item label="停電影響">停此 VCB → {vcb.connected_building_count} 棟停電</Descriptions.Item>
      </Descriptions>
    );

  return <Empty description="載入中…" style={{ paddingTop: 60 }} />;
}
