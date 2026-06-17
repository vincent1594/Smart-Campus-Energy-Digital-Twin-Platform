// 規劃模擬:讀焦點帶入 → 改負載/容量/線長 → Run(/api/scenario/run)→ 前後對比 + 地圖過載標紅。
import { Button, Card, DatePicker, Divider, Empty, InputNumber, Select, Slider, Spin, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, DashboardSummary, FeederDetail, PowerFlowResult, ScenarioComparison, ScenarioRequest, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import { useFocus } from "../focus/FocusContext";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import { buildingLetter } from "../lib/campusPositions";

function markersFrom(result: PowerFlowResult, buildings: BuildingSummary[]): MapMarker[] {
  const tr = new Map(result.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]));
  const zones = new Map<string, { name: string; ratio: number | null }>();
  for (const b of buildings) {
    const L = buildingLetter(b.id);
    if (!zones.has(L)) zones.set(L, { name: b.name.replace(/\s*\(.*\)/, ""), ratio: null });
    const r = tr.get(b.transformer_name);
    if (r != null) { const z = zones.get(L)!; z.ratio = Math.max(z.ratio ?? 0, r); }
  }
  return [{ letter: "X", name: "受電站(X棟)", ratio: null }, ...[...zones.entries()].map(([letter, z]) => ({ letter, name: z.name, ratio: z.ratio }))];
}

function CompareRow({ label, before, after, unit, worseWhenUp = true }: { label: string; before: number; after: number; unit?: string; worseWhenUp?: boolean }) {
  const worse = worseWhenUp ? after > before : after < before;
  const color = after === before ? "#888" : worse ? "#cf1322" : "#3f8600";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 16px auto", gap: 6, alignItems: "center", padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ color: "#999" }}>{before}{unit}</span>
      <span style={{ color }}>→</span>
      <b style={{ color }}>{after}{unit}</b>
    </div>
  );
}

export default function Scenario() {
  const { focus } = useFocus();
  const { setScenario } = useActiveScenario();
  const [base, setBase] = useState<DashboardSummary>();
  const [basePf, setBasePf] = useState<PowerFlowResult>();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const [feeders, setFeeders] = useState<FeederDetail[]>([]);

  const [total, setTotal] = useState<number>(0);
  const [zone, setZone] = useState<string>();
  const [zoneKw, setZoneKw] = useState<number | null>(null);
  const [tr, setTr] = useState<string>();
  const [trKva, setTrKva] = useState<number | null>(null);
  const [fd, setFd] = useState<string>();
  const [fdM, setFdM] = useState<number | null>(null);

  const [cmp, setCmp] = useState<ScenarioComparison | null>(null);
  const [running, setRunning] = useState(false);
  const [ts, setTs] = useState<string>();          // 模擬時間點 "YYYY-MM-DD HH:mm"
  const [pvf, setPvf] = useState<number>(0.8);     // 太陽能出力係數

  useEffect(() => {
    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers(), api.feeders()])
      .then(([d, p, b, t, f]) => { setBase(d); setBasePf(p); setBuildings(b); setTrafos(t); setFeeders(f); setTotal(d.total_load_kw); })
      .catch((e) => message.error(String(e.message ?? e)));
  }, []);

  const runForecast = () => {
    if (!ts) { message.warning("請先選擇模擬時間點"); return; }
    setRunning(true);
    api.runForecast({ timestamp: ts, pv_factor: pvf }).then((c) => { setCmp(c); setScenario(c.scenario); })
      .catch((e) => message.error(String(e.message ?? e))).finally(() => setRunning(false));
  };

  // 區域彙總(棟別 → 該區所有負載 + 現況總和)
  const zones = useMemo(() => {
    const m = new Map<string, { letter: string; name: string; loads: { id: string; kw: number }[]; total: number }>();
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      if (!m.has(L)) m.set(L, { letter: L, name: b.name.replace(/\s*\(.*\)/, ""), loads: [], total: 0 });
      const z = m.get(L)!; z.loads.push({ id: b.id, kw: b.estimated_load_kw }); z.total += b.estimated_load_kw;
    }
    return m;
  }, [buildings]);

  // 從焦點帶入
  useEffect(() => {
    if (!focus || !buildings.length) return;
    if (focus.kind === "building") { const L = buildingLetter(focus.id); setZone(L); setZoneKw(zones.get(L)?.total ?? null); }
    else if (focus.kind === "transformer") { setTr(focus.id); setTrKva(trafos.find((t) => t.id === focus.id)?.capacity_kva ?? null); }
  }, [focus, buildings, trafos, zones]);

  const run = () => {
    if (!base) return;
    const req: ScenarioRequest = {};
    if (total && Math.round(total) !== Math.round(base.total_load_kw)) req.total_load_kw = Math.round(total);
    if (zone && zoneKw != null) {
      const z = zones.get(zone);
      if (z) req.building_loads = z.total > 0
        ? z.loads.map((l) => ({ building_id: l.id, load_kw: Math.round((zoneKw * l.kw / z.total) * 10) / 10 }))
        : z.loads.map((l) => ({ building_id: l.id, load_kw: Math.round((zoneKw / z.loads.length) * 10) / 10 }));
    }
    if (tr && trKva != null) req.transformer_capacities = { [tr]: trKva };
    if (fd && fdM != null) req.feeder_lengths = { [fd]: fdM };
    setRunning(true);
    api.runScenario(req).then((c) => { setCmp(c); setScenario(c.scenario); }).catch((e) => message.error(String(e.message ?? e))).finally(() => setRunning(false));
  };
  const reset = () => { setTotal(base?.total_load_kw ?? 0); setZone(undefined); setZoneKw(null); setTr(undefined); setTrKva(null); setFd(undefined); setFdM(null); setCmp(null); setScenario(null); setTs(undefined); };

  const shown = cmp ? cmp.scenario : basePf;
  const markers = useMemo(() => (shown ? markersFrom(shown, buildings) : []), [shown, buildings]);
  const newOverload = useMemo(() => {
    if (!cmp) return [];
    const baseR = new Map(cmp.base.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]));
    return cmp.scenario.transformer_loadings.filter((t) => t.load_ratio_percent > 100)
      .map((t) => ({ name: t.transformer_name, before: baseR.get(t.transformer_id) ?? 0, after: t.load_ratio_percent }));
  }, [cmp]);

  if (!base || !basePf) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr 320px", gap: 10 }}>
      {/* 左:情境設定 */}
      <Card size="small" title="情境設定" style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>模擬時間點(XGBoost 預測)</div>
        <DatePicker showTime format="YYYY-MM-DD HH:mm" size="small" style={{ width: "100%", marginBottom: 6 }}
          placeholder="選日期 + 時段" minuteStep={30}
          onChange={(_, ds) => setTs(typeof ds === "string" ? ds : undefined)} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: "#888", fontSize: 12, whiteSpace: "nowrap" }}>太陽能出力</span>
          <Slider style={{ flex: 1, margin: "0 4px" }} min={0} max={1} step={0.05} value={pvf} onChange={setPvf} tooltip={{ formatter: (v) => `×${v}` }} />
          <span style={{ fontSize: 12, color: "#666", width: 30, textAlign: "right" }}>×{pvf}</span>
        </div>
        <Button type="primary" block loading={running} onClick={runForecast}>預測並模擬</Button>

        <Divider style={{ margin: "8px 0" }} orientation="left" plain>手動 what-if</Divider>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>總負載</div>
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={0} value={Math.round(total)} onChange={(v) => setTotal(v ?? 0)} />
        <Slider min={0.5} max={3} step={0.05} value={base.total_load_kw ? total / base.total_load_kw : 1} style={{ margin: "2px 4px 20px" }}
          onChange={(f) => setTotal(Math.round(base.total_load_kw * f))} marks={{ 1: "現況", 2: "×2", 3: "×3" }} tooltip={{ formatter: (f) => `×${f?.toFixed(2)}` }} />

        <Divider style={{ margin: "6px 0" }} orientation="left" plain>單區負載</Divider>
        <Select size="small" style={{ width: "100%", marginBottom: 4 }} placeholder="選區域(棟)" allowClear showSearch optionFilterProp="label"
          value={zone} onChange={(v) => { setZone(v); setZoneKw(v ? (zones.get(v)?.total ?? null) : null); }}
          options={[...zones.values()].map((z) => ({ value: z.letter, label: `${z.name}（${z.letter}棟,${z.loads.length}台）` }))} />
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={0} value={zoneKw} onChange={setZoneKw} disabled={!zone} placeholder="區域總負載 kW" />

        <Divider style={{ margin: "6px 0" }} orientation="left" plain>變壓器容量</Divider>
        <Select size="small" style={{ width: "100%", marginBottom: 4 }} placeholder="選變壓器" allowClear showSearch optionFilterProp="label"
          value={tr} onChange={(v) => { setTr(v); setTrKva(trafos.find((t) => t.id === v)?.capacity_kva ?? null); }}
          options={trafos.map((t) => ({ value: t.id, label: `${t.name}（${t.capacity_kva}kVA）` }))} />
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="kVA" min={0} value={trKva} onChange={setTrKva} disabled={!tr} placeholder="容量 kVA" />

        <Divider style={{ margin: "6px 0" }} orientation="left" plain>饋線長度</Divider>
        <Select size="small" style={{ width: "100%", marginBottom: 4 }} placeholder="選饋線" allowClear showSearch optionFilterProp="label"
          value={fd} onChange={(v) => { setFd(v); setFdM(feeders.find((f) => f.id === v)?.length_m ?? null); }}
          options={feeders.map((f) => ({ value: f.id, label: `${f.name}（${f.length_m.toFixed(0)}m）` }))} />
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="m" min={0} value={fdM} onChange={setFdM} disabled={!fd} placeholder="長度 m" />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Button type="primary" block loading={running} onClick={run}>執行模擬</Button>
          <Button onClick={reset}>重設</Button>
        </div>
      </Card>

      {/* 中:地圖(過載標紅) */}
      <Card size="small" title={cmp ? "模擬後負載分布" : "現況負載分布"} style={{ height: "100%" }}
        styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}
        extra={
          <span style={{ fontSize: 12, color: "#999" }}>
            <Tag color="#52c41a">正常</Tag><Tag color="#fadb14">中載</Tag><Tag color="#fa8c16">吃緊</Tag><Tag color="#ff4d4f">過載&gt;100%</Tag>
          </span>
        }>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
          {shown && <CampusMapStatic markers={markers} fitHeight />}
        </div>
      </Card>

      {/* 右:前後對比 */}
      <Card size="small" title="修改前 / 後對比" style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
        {!cmp ? <Empty description="設定左側參數後按「執行模擬」" style={{ paddingTop: 50 }} /> : (
          <>
            <CompareRow label="總負載" before={cmp.base.total_load_kw} after={cmp.scenario.total_load_kw} unit="kW" />
            <CompareRow label="系統損耗" before={cmp.base.system_loss_kw} after={cmp.scenario.system_loss_kw} unit="kW" />
            <CompareRow label="最低電壓" before={cmp.base.min_voltage_pu} after={cmp.scenario.min_voltage_pu} unit="pu" worseWhenUp={false} />
            <CompareRow label="最大變壓器" before={cmp.base.max_transformer_load_ratio_percent} after={cmp.scenario.max_transformer_load_ratio_percent} unit="%" />
            <CompareRow label="最大饋線" before={cmp.base.max_feeder_load_ratio_percent} after={cmp.scenario.max_feeder_load_ratio_percent} unit="%" />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
              <span style={{ color: "#666" }}>狀態</span>
              <span><Tag>{cmp.base.status}</Tag>→<Tag color={cmp.scenario.status === "OK" ? "green" : cmp.scenario.status === "WARNING" ? "orange" : "red"}>{cmp.scenario.status}</Tag></span>
            </div>
            <Divider style={{ margin: "10px 0" }}>過載變壓器（{newOverload.length}）</Divider>
            {newOverload.length === 0 ? <div style={{ color: "#3f8600", fontSize: 13 }}>無變壓器過載</div> :
              newOverload.map((o) => (
                <div key={o.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                  <span>{o.name}</span>
                  <span style={{ color: "#cf1322" }}>{o.before.toFixed(0)}% → {o.after.toFixed(0)}%</span>
                </div>
              ))}
          </>
        )}
      </Card>
    </div>
  );
}
