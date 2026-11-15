import { Button, Descriptions, Divider, Empty, List, Space, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, getNetwork } from "../api/client";
import type { BuildingDetail, BuildingSummary, DashboardSummary, DerAsset, FeederDetail, PowerFlowResult, SupplyPathNode, TransformerDetail, VcbDetail } from "../api/types";
import { type Focus, useFocus } from "../focus/FocusContext";
import { SOURCE_LETTER_BY_NET, buildingLetter } from "../lib/campusPositions";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";
import { useNetScenario } from "../scenario/ActiveScenarioContext";
import { loadScale } from "../lib/scenarioScale";
import LoadRatioTag from "./LoadRatioTag";

const kindStep: Record<string, string> = { source: "台電進線", vcb: "VCB", feeder: "饋線", transformer: "變壓器", building: "建築" };

// 未選取時的右欄總覽:負載率最高設備 + 用電最高建築 + 需留意數(皆可點跳焦點)
function OverviewSummary({ buildings, trafos, dash, onPick }: {
  buildings: BuildingSummary[]; trafos: TransformerDetail[]; dash?: DashboardSummary;
  onPick: (f: Focus) => void;
}) {
  const ratioColor = (r: number) => (r > 100 ? "#cf1322" : r >= 80 ? "#fa8c16" : r >= 50 ? "#1677ff" : "#52c41a");

  // 套用作用中模擬情境的變壓器負載率(無情境則用 base)
  const { scenario, scenarioKind } = useNetScenario();
  const sMap = useMemo(() => new Map(scenario?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []), [scenario]);
  const effR = (t: TransformerDetail) => (scenario ? sMap.get(t.id) ?? t.load_ratio_percent ?? 0 : t.load_ratio_percent ?? 0);

  const topTrafos = useMemo(
    () => [...trafos].filter((t) => t.load_ratio_percent != null)
      .sort((a, b) => effR(b) - effR(a)).slice(0, 5),
    [trafos, scenario],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  // 建築在情境下的用電:依其變壓器負載率變化等比例縮放(情境率/基準率),使「用電最高建築」隨拖曳連動
  const trByName = useMemo(() => new Map(trafos.map((t) => [t.name, t])), [trafos]);
  const topZones = useMemo(() => {
    const m = new Map<string, { letter: string; name: string; load: number; repId: string }>();
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      const t = trByName.get(b.transformer_name);
      let f = 1;
      if (scenario && t) {
        const baseR = t.load_ratio_percent ?? 0;
        f = baseR > 0 ? (sMap.get(t.id) ?? baseR) / baseR : 1;
      }
      const z = m.get(L) ?? { letter: L, name: b.name.replace(/\s*\(.*\)/, ""), load: 0, repId: b.id };
      z.load += b.estimated_load_kw * f; m.set(L, z);
    }
    return [...m.values()].sort((a, b) => b.load - a.load).slice(0, 5);
  }, [buildings, trByName, scenario, sMap]);
  const watch = useMemo(() => trafos.filter((t) => effR(t) >= 80).length, [trafos, scenario]);   // eslint-disable-line react-hooks/exhaustive-deps
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
        {scenario && scenarioKind === "whatif" ? <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>模擬情境</Tag>
          : <span style={{ fontSize: 11, color: "#bbb" }}>點地圖 / 清單看細節</span>}
      </div>
      <div style={{ display: "flex", gap: 6, color: "#888", fontSize: 12, marginBottom: 10 }}>
        <span>供電建築 <b style={{ color: "#555" }}>{dash?.substation_count != null ? dash.substation_count + 1 : "—"}</b> 棟</span>
        <span>·</span>
        <span>變壓器 <b style={{ color: "#555" }}>{trafos.length}</b> 台</span>
        {watch > 0 && <><span>·</span><span style={{ color: "#fa8c16" }}>{watch} 台負載 ≥80%</span></>}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#666", margin: "0 0 6px" }}>負載率最高設備</div>
      {topTrafos.map((t) => {
        const r = effR(t);
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

/** 建築詳細資料 → 本地電源 (情境連動:有套用情境時出力/逆送改取情境潮流結果);無微電網回 null。 */
export function localSupplyOf(bd: BuildingDetail, scenario: PowerFlowResult | null): LocalSupply | null {
  if (!bd.local_sources?.length || !bd.local_bus) return null;
  const out = new Map(scenario?.der_outputs?.map((o) => [o.der_id, o]) ?? []);
  const tl = scenario?.transformer_loadings.find((t) => t.transformer_id === bd.transformer_id);
  return {
    bus: bd.local_bus,
    busKv: bd.local_bus_kv ?? null,
    exportKw: tl?.power_kw != null ? Math.max(0, -tl.power_kw) : (bd.transformer_export_kw ?? 0),
    sources: bd.local_sources.map((d) => {
      const o = out.get(d.der_id);
      return {
        id: d.der_id, kind: d.kind,
        size: d.kind === "pv" ? `${d.kwp}kWp` : d.kind === "ess" ? `${d.rating_kw}kW/${d.energy_kwh}kWh` : `${d.rating_kw}kW`,
        kwp: d.kwp ?? 0, ratingKw: d.rating_kw, energyKwh: d.energy_kwh ?? 0,
        powerKw: o ? o.power_kw : d.power_kw, inService: o ? o.in_service : d.in_service,
      };
    }),
  };
}

// 微電網本地電源:在變壓器與建築之間插入「低壓母線匯流點 + 本地電源」
export interface LocalSupply {
  bus: string;
  busKv: number | null;
  sources: { id: string; kind: "pv" | "ess" | "gen"; size: string; kwp: number; ratingKw: number; energyKwh: number; powerKw: number; inService: boolean }[];
  exportKw: number;   // 變壓器逆送 (>0 = 往台電送)
}

// 供電路徑:電纜/變壓器/VCB 可點 → 切焦點;有微電網時插入匯流母線與本地電源 (點本地電源 → 微電網頁)
function PathView({ nodes, onPick, local, onOpenMicrogrid }: {
  nodes: SupplyPathNode[]; onPick: (f: Focus) => void; local?: LocalSupply | null; onOpenMicrogrid?: () => void;
}) {
  type Row = { t: "node"; n: SupplyPathNode } | { t: "bus" };
  const rows: Row[] = [];
  nodes.forEach((n) => {
    if (n.kind === "building" && local) rows.push({ t: "bus" });
    rows.push({ t: "node", n });
  });
  // 本地電源依類型合併成一列 (例:☀98kWp 0kW · 🔋200kW/430kWh 待機),維持焦點面板一頁不捲動
  const kindSummary = (k: "pv" | "ess" | "gen") => {
    const ss = local?.sources.filter((s) => s.kind === k) ?? [];
    if (!ss.length) return null;
    const p = ss.reduce((a, s) => a + (s.inService ? s.powerKw : 0), 0);
    const tot = (f: (s: (typeof ss)[number]) => number) => +ss.reduce((a, s) => a + f(s), 0).toFixed(2);
    const size = k === "pv" ? `${tot((s) => s.kwp)}kWp`
      : k === "ess" ? `${tot((s) => s.ratingKw)}kW/${tot((s) => s.energyKwh)}kWh` : `${tot((s) => s.ratingKw)}kW`;
    const state = ss.every((s) => !s.inService) ? "備用" : k === "ess" && Math.abs(p) < 0.05 ? "待機"
      : p < 0 ? `充電${(-p).toFixed(0)}kW` : `${p.toFixed(0)}kW`;
    return { icon: { pv: "☀", ess: "🔋", gen: "⚡" }[k], size, state, live: p > 0.05 };
  };
  const compact = { padding: "5px 0" };
  return (
    <List size="small" dataSource={rows} renderItem={(r) => {
      if (r.t === "bus") return (
        <List.Item style={{ ...compact, cursor: onOpenMicrogrid ? "pointer" : undefined, display: "block" }} onClick={onOpenMicrogrid}>
          <Space size={6}>
            <Tag color="green">母線</Tag>
            <span>{local!.bus}{local!.busKv ? ` ${Math.round(local!.busKv * 1000)}V` : ""}</span>
            <span style={{ color: "#999", fontSize: 12 }}>＋本地電源</span>
          </Space>
          <div style={{ fontSize: 12, marginTop: 2, paddingLeft: 4, color: "#666" }}>
            {(["pv", "ess", "gen"] as const).map((k) => kindSummary(k)).filter(Boolean).map((s, i) => (
              <span key={i} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                {s!.icon} {s!.size} <span style={{ color: s!.live ? "#389e0d" : "#999" }}>{s!.state}</span>
              </span>
            ))}
          </div>
        </List.Item>
      );
      const n = r.n;
      const clickable = n.kind === "vcb" || n.kind === "feeder" || n.kind === "transformer";
      const extra = n.kind === "feeder"
        ? `${n.length_m?.toFixed(0) ?? "?"}m · ${n.cross_section_mm2 ?? "?"}mm² · ${n.load_ratio_percent?.toFixed(0) ?? "?"}%`
        : n.kind === "transformer"
        ? `${n.capacity_kva ?? "?"}kVA · ${n.load_ratio_percent?.toFixed(0) ?? "?"}%`
        : "";
      return (
        <List.Item style={clickable ? { ...compact, cursor: "pointer" } : compact}
          onClick={clickable ? () => onPick({ kind: n.kind as Focus["kind"], id: n.id, label: n.name }) : undefined}>
          <Space size={6}>
            <Tag>{kindStep[n.kind]}</Tag>
            <span>{n.name}</span>
            {extra && <span style={{ color: "#999", fontSize: 12 }}>{extra}</span>}
            {n.kind === "transformer" && local && local.exportKw > 0.5 && <Tag color="orange">逆送 {local.exportKw.toFixed(1)} kW</Tag>}
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
  const [trDers, setTrDers] = useState<DerAsset[]>([]);   // 焦點變壓器低壓側的微電網設備

  const { scenario } = useNetScenario();
  const sTrafo = useMemo(() => new Map(scenario?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []), [scenario]);
  const sFeeder = useMemo(() => new Map(scenario?.feeder_loadings.map((f) => [f.feeder_id, f.load_ratio_percent]) ?? []), [scenario]);
  const trRatio = (id: string, base: number | null) => (scenario ? sTrafo.get(id) ?? base : base);
  const fdRatio = (id: string, base: number | null) => (scenario ? sFeeder.get(id) ?? base : base);
  // 情境連動:連接負載 = base × (情境率/基準率);結構/容量維持 base。
  const effTrLoad = (t: TransformerDetail) => t.total_connected_load_kw * (scenario ? loadScale(sTrafo.get(t.id), t.load_ratio_percent) : 1);

  const trafoByName = useMemo(() => new Map(trafos.map((t) => [t.name, t])), [trafos]);
  const letterOfTrafo = (name: string) => {
    const b = buildings.find((x) => x.transformer_name === name);
    return b ? buildingLetter(b.id) : "";
  };

  useEffect(() => {
    setBd(null); setTr(null); setFd(null); setVcb(null); setTrDers([]);
    if (!focus) return;
    if (focus.kind === "building") api.building(focus.id).then(setBd).catch(() => {});
    else if (focus.kind === "transformer") {
      api.transformer(focus.id).then(setTr).catch(() => {});
      api.der().then((ds) => setTrDers(ds.filter((d) => d.transformer_id === focus.id))).catch(() => setTrDers([]));
    }
    else if (focus.kind === "feeder") api.feeder(focus.id).then(setFd).catch(() => {});
    else if (focus.kind === "vcb") api.vcbs().then((vs) => setVcb(vs.find((v) => v.id === focus.id) ?? null));
  }, [focus]);

  if (!focus) return <OverviewSummary buildings={buildings} trafos={trafos} dash={dash} onPick={setFocus} />;

  // ---- 受電站(依當前系統:北 X / 南 H1)----
  if (focus.kind === "source") {
    const sl = SOURCE_LETTER_BY_NET[getNetwork()] ?? "X";
    const side = getNetwork() === "south" ? "南側" : "北側";
    return (
      <Descriptions title={`台電受電站(${sl}棟)`} bordered column={1} size="small">
        <Descriptions.Item label="進線">台電 11.4kV</Descriptions.Item>
        <Descriptions.Item label="VCB">{dash?.vcb_count ?? "—"} 路(皆於 {sl}棟匯集)</Descriptions.Item>
        <Descriptions.Item label="供電建築">
          {dash?.substation_count != null ? dash.substation_count + 1 : "—"} 棟
          <span style={{ color: "#999", fontSize: 12, marginInlineStart: 4 }}>(含受電站 {sl}棟)</span>
        </Descriptions.Item>
        <Descriptions.Item label={`${side}總負載`}>{dash?.total_load_kw ?? "—"} kW</Descriptions.Item>
        <Descriptions.Item label="停電影響">此處停電 → 整個{side}系統停電</Descriptions.Item>
      </Descriptions>
    );
  }

  // ---- 建築(棟層級總覽 + 變壓器清單切換)----
  if (focus.kind === "building") {
    const letter = buildingLetter(focus.id);
    const zoneBuildings = buildings.filter((b) => buildingLetter(b.id) === letter);
    const trafoNames = [...new Set(zoneBuildings.map((b) => b.transformer_name))];
    const zoneTrafos = trafoNames.map((n) => trafoByName.get(n)).filter(Boolean) as TransformerDetail[];
    const totalLoad = zoneBuildings.reduce((s, b) => {
      const t = trafoByName.get(b.transformer_name);
      const f = scenario && t ? loadScale(sTrafo.get(t.id), t.load_ratio_percent) : 1;
      return s + b.estimated_load_kw * f;
    }, 0);
    const maxRatio = Math.max(0, ...zoneTrafos.map((t) => trRatio(t.id, t.load_ratio_percent) ?? 0));
    const vcbName = zoneTrafos[0]?.vcb_name ?? "—";
    // 此棟是否即為該系統受電站(南 H1 兼宿舍 / 北 X)→ 卡片同時標明受電站身分與資訊
    const isSource = letter === (SOURCE_LETTER_BY_NET[getNetwork()] ?? "");
    const side = getNetwork() === "south" ? "南側" : "北側";
    return (
      <>
        {isSource && (
          <>
            <Space><Tag color="purple">受電站</Tag><b style={{ fontSize: 16 }}>{letter}棟</b></Space>
            <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
              <Descriptions.Item label="進線">台電 11.4kV(本棟為{side}受電站)</Descriptions.Item>
              <Descriptions.Item label="VCB">{dash?.vcb_count ?? "—"} 路匯集於本棟</Descriptions.Item>
              <Descriptions.Item label="停電影響">此處停電 → 整個{side}系統停電</Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: "10px 0" }} />
          </>
        )}
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
        <PathView nodes={(bd?.supply_path ?? []).map((n) => n.kind === "transformer" ? { ...n, load_ratio_percent: trRatio(n.id, n.load_ratio_percent ?? null) } : n.kind === "feeder" ? { ...n, load_ratio_percent: fdRatio(n.id, n.load_ratio_percent ?? null) } : n)} onPick={setFocus}
          local={bd ? localSupplyOf(bd, scenario) : null} onOpenMicrogrid={() => navigate("/microgrid")} />
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
          <Descriptions.Item label="連接負載點">{tr.connected_building_count} 個 / {effTrLoad(tr).toFixed(1)} kW</Descriptions.Item>
          <Descriptions.Item label="運轉狀態">{(trRatio(tr.id, tr.load_ratio_percent) ?? 0) > 100 ? <Tag color="red">過載</Tag> : <Tag color="green">正常</Tag>}</Descriptions.Item>
          {trDers.length > 0 && (
            <Descriptions.Item label="微電網">
              <Space size={[4, 4]} wrap>
                {trDers.map((d) => {
                  const o = scenario?.der_outputs?.find((x) => x.der_id === d.der_id);
                  const on = o ? o.in_service : d.in_service;
                  const p = o ? o.power_kw : d.power_kw;
                  const icon = d.kind === "pv" ? "☀" : d.kind === "ess" ? "🔋" : "⚡";
                  const size = d.kind === "pv" ? `${d.kwp}kWp` : d.kind === "ess" ? `${d.rating_kw}kW/${d.energy_kwh}kWh` : `${d.rating_kw}kW`;
                  return <Tag key={d.der_id} color={d.kind === "pv" ? "green" : d.kind === "ess" ? "cyan" : "orange"}>
                    {icon} {d.der_id} {size} · {on ? `${p.toFixed(0)}kW` : "備用"}
                  </Tag>;
                })}
              </Space>
            </Descriptions.Item>
          )}
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
        <Descriptions.Item label="供電">{fd.transformer_count} 台變壓器 / {fd.connected_building_count} 棟 / {(fd.total_connected_load_kw * (scenario ? loadScale(sFeeder.get(fd.id), fd.load_ratio_percent) : 1)).toFixed(1)} kW</Descriptions.Item>
      </Descriptions>
    );

  // ---- VCB ----
  if (focus.kind === "vcb" && vcb) {
    // 受影響棟別 = 此 VCB 供電的不重複實體棟(以棟別代號去重),= 地圖紅色亮起的那些
    const affected = new Set(buildings.filter((b) => trafoByName.get(b.transformer_name)?.vcb_id === vcb.id).map((b) => buildingLetter(b.id)));
    // 情境連動:合計負載 = 旗下各變壓器 base 連接負載 × (情境率/基準率) 加總。
    const vcbLoad = scenario
      ? trafos.filter((t) => t.vcb_id === vcb.id).reduce((s, t) => s + effTrLoad(t), 0)
      : vcb.total_connected_load_kw;
    return (
      <Descriptions title={<><Tag color="cyan">VCB</Tag>{vcb.name}</>} column={1} size="small">
        <Descriptions.Item label="饋線數">{vcb.feeder_count}</Descriptions.Item>
        <Descriptions.Item label="變壓器數">{vcb.transformer_count}</Descriptions.Item>
        <Descriptions.Item label="供電建築">{affected.size} 棟</Descriptions.Item>
        <Descriptions.Item label="合計負載">{vcbLoad.toFixed(1)} kW</Descriptions.Item>
        <Descriptions.Item label="停電影響"><b style={{ color: "#cf1322" }}>{affected.size} 棟</b>一同停電(地圖紅標)</Descriptions.Item>
      </Descriptions>
    );
  }

  return <Empty description="載入中…" style={{ paddingTop: 60 }} />;
}
