import { Button, Descriptions, Divider, Empty, List, Space, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BuildingDetail, BuildingSummary, DashboardSummary, FeederDetail, SupplyPathNode, TransformerDetail, VcbDetail } from "../api/types";
import { type Focus, useFocus } from "../focus/FocusContext";
import { buildingLetter } from "../lib/campusPositions";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import LoadRatioTag from "./LoadRatioTag";

const kindStep: Record<string, string> = { source: "台電進線", vcb: "VCB", feeder: "饋線", transformer: "變壓器", building: "建築" };

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

  if (!focus) return <Empty description="點地圖棟別 / 左側清單,查看詳情" style={{ paddingTop: 60 }} />;

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
