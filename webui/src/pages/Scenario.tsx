// 規劃模擬:讀焦點帶入 → 改負載/容量/線長 → Run(/api/scenario/run)→ 前後對比 + 地圖過載標紅。
import { Button, Card, DatePicker, Divider, Empty, Input, InputNumber, Segmented, Select, Slider, Spin, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, getNetwork, setNetwork } from "../api/client";
import type { BuildingSummary, DashboardSummary, FeederDetail, PlanSimulateResult, PowerFlowResult, ScenarioComparison, ScenarioRequest, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import { useFocus } from "../focus/FocusContext";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import { buildingLetter, DEV_NETS, type Pt, SOURCE_LETTER_BY_NET } from "../lib/campusPositions";
import { appendTransformer, KVA_OPTIONS, LV_OPTIONS, newPlanBuilding, PLAN_COLOR, USAGE_OPTIONS, usePlanBuildings } from "../lib/planBuildings";

function markersFrom(result: PowerFlowResult, buildings: BuildingSummary[], net: string): MapMarker[] {
  const tr = new Map(result.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]));
  const zones = new Map<string, { name: string; ratio: number | null }>();
  for (const b of buildings) {
    const L = buildingLetter(b.id);
    if (!zones.has(L)) zones.set(L, { name: b.name.replace(/\s*\(.*\)/, ""), ratio: null });
    const r = tr.get(b.transformer_name);
    if (r != null) { const z = zones.get(L)!; z.ratio = Math.max(z.ratio ?? 0, r); }
  }
  const zoneList = [...zones.entries()].map(([letter, z]) => ({ letter, name: z.name, ratio: z.ratio }));
  // 受電站:北 X 非建物需另加;南 H1 本身即建物(已在清單)。
  const srcLetter = SOURCE_LETTER_BY_NET[net];
  const needSrc = srcLetter && !zoneList.some((m) => m.letter === srcLetter);
  return [...(needSrc ? [{ letter: srcLetter, name: `受電站(${srcLetter}棟)`, ratio: null }] : []), ...zoneList];
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

  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([]);   // 可切換電網 (南/北)
  const [currentNet, setCurrentNet] = useState(getNetwork());                       // 當前電網 (state → 切換重抓重繪,不刷頁)
  useEffect(() => { api.networks().then(setNetworks).catch(() => undefined); }, []);

  // 規劃建物(what-if 新增建物;此版純前端 localStorage,尚未接潮流)
  const [mode, setMode] = useState<"scenario" | "plan">("scenario");
  const { items: plans, add: addPlan, update: updatePlan, remove: removePlan } = usePlanBuildings(currentNet);
  const [placing, setPlacing] = useState(false);
  const [selPlan, setSelPlan] = useState<string | null>(null);
  const [planCmp, setPlanCmp] = useState<PlanSimulateResult | null>(null);   // 加入模擬結果
  const sel = useMemo(() => plans.find((p) => p.id === selPlan) ?? null, [plans, selPlan]);

  // VCB 下拉:由饋線清單去重(此版只存代號,不驗證連接合法性)
  const vcbOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feeders) m.set(f.vcb_id, f.vcb_name);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [feeders]);

  const placePlan = (at: Pt) => {
    const b = newPlanBuilding(at, plans);
    addPlan(b);
    setSelPlan(b.id);
    setPlacing(false);
    setPlanCmp(null);   // 新增建物 → 舊模擬結果作廢
  };

  // 選一棟來編輯 → 收起模擬結果(避免顯示過期數字)
  const editPlan = (id: string) => { setSelPlan(id); setPlacing(false); setPlanCmp(null); };

  // 加入模擬:把所有規劃建物疊入模型跑潮流 + 護欄
  const runPlan = () => {
    if (!plans.length) return;
    setRunning(true);
    api.planSimulate({
      buildings: plans.map((p) => ({
        id: p.id, name: p.name, cable_length_m: p.cableLength_m, cross_section_mm2: null,
        transformers: p.transformers.map((t) => ({ capacity_kva: t.capacity_kva, lv_voltage: t.lv_voltage, load_kw: t.load_kw, pf: t.pf })),
      })),
    }).then((r) => { setPlanCmp(r); setSelPlan(null); setScenario(r.scenario, "whatif", currentNet); })
      .catch((e) => message.error(String(e.message ?? e))).finally(() => setRunning(false));
  };

  // Esc 取消放置模式
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlacing(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  // 切換電網 (含首載) → 重抓該網 base 資料;先清掉上一網的模擬結果/情境/手動 what-if 選擇,避免殘留。
  useEffect(() => {
    setCmp(null); setScenario(null); setTs(undefined);
    setZone(undefined); setZoneKw(null); setTr(undefined); setTrKva(null); setFd(undefined); setFdM(null);
    setSelPlan(null); setPlacing(false); setPlanCmp(null);
    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers(), api.feeders()])
      .then(([d, p, b, t, f]) => { setBase(d); setBasePf(p); setBuildings(b); setTrafos(t); setFeeders(f); setTotal(d.total_load_kw); })
      .catch((e) => message.error(String(e.message ?? e)));
  }, [currentNet]);   // eslint-disable-line react-hooks/exhaustive-deps

  const runForecast = () => {
    if (!ts) { message.warning("請先選擇模擬時間點"); return; }
    setRunning(true);
    api.runForecast({ timestamp: ts, pv_factor: pvf }).then((c) => { setCmp(c); setScenario(c.scenario, "whatif", currentNet); })
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
    api.runScenario(req).then((c) => { setCmp(c); setScenario(c.scenario, "whatif", currentNet); }).catch((e) => message.error(String(e.message ?? e))).finally(() => setRunning(false));
  };
  const reset = () => { setTotal(base?.total_load_kw ?? 0); setZone(undefined); setZoneKw(null); setTr(undefined); setTrKva(null); setFd(undefined); setFdM(null); setCmp(null); setScenario(null); setTs(undefined); };

  const shown = cmp ? cmp.scenario : basePf;
  const mapResult = mode === "plan" && planCmp ? planCmp.scenario : shown;   // 加入模擬後,既有建物依新潮流重新上色
  const markers = useMemo(() => (mapResult ? markersFrom(mapResult, buildings, currentNet) : []), [mapResult, buildings, currentNet]);
  // 加入模擬後:規劃建物 id→負載率,交給地圖以熱力色階替鬼影上色
  const planRatios = useMemo(() => {
    if (!planCmp) return undefined;
    return Object.fromEntries(planCmp.building_loadings.map((b) => [b.id, b.load_ratio_percent]));
  }, [planCmp]);
  const switchNet = (id: string) => { if (id !== currentNet) { setNetwork(id); setCurrentNet(id); } };
  const netList = networks.length ? networks : [{ id: "north", name: "北電錶" }, { id: "south", name: "南電錶" }];
  const newOverload = useMemo(() => {
    if (!cmp) return [];
    const baseR = new Map(cmp.base.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]));
    return cmp.scenario.transformer_loadings.filter((t) => t.load_ratio_percent > 100)
      .map((t) => ({ name: t.transformer_name, before: baseR.get(t.transformer_id) ?? 0, after: t.load_ratio_percent }));
  }, [cmp]);

  if (!base || !basePf) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <div className="cmd-stagger" style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr 320px", gap: 10 }}>
      {/* 左:情境設定 */}
      <Card size="small" title={<span className="cmd-accentbar">{mode === "scenario" ? "情境設定" : "規劃建物"}</span>} style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
        <Segmented block size="small" value={mode} onChange={(v) => setMode(v as "scenario" | "plan")} style={{ marginBottom: 10 }}
          options={[{ label: "情境模擬", value: "scenario" }, { label: "新增建物", value: "plan" }]} />

        {mode === "plan" && (
          <>
            <Button type={placing ? "default" : "primary"} block onClick={() => setPlacing((p) => !p)}>
              {placing ? "點地圖空白處放置…(Esc 取消)" : "＋ 在地圖上新增建物"}
            </Button>
            <div style={{ color: "#999", fontSize: 11.5, lineHeight: 1.6, margin: "6px 0 2px" }}>
              到中間地圖點一下放一棟規劃建物,再點它、於右側填電氣規格。可拖曳移動位置。
            </div>
            <Divider style={{ margin: "8px 0" }} orientation="left" plain>規劃建物({plans.length})</Divider>
            {plans.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無規劃建物" style={{ margin: "20px 0" }} />
            ) : (
              plans.map((p) => (
                <div key={p.id} onClick={() => editPlan(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", marginBottom: 4, cursor: "pointer",
                    borderRadius: 6, border: `1px solid ${p.id === selPlan ? PLAN_COLOR : "#eee"}`,
                    background: p.id === selPlan ? `${PLAN_COLOR}12` : "#fafafa" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: PLAN_COLOR, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "#999" }}>
                    {p.vcb ? (vcbOptions.find((o) => o.value === p.vcb)?.label ?? p.vcb) : "未接"}｜{p.transformers.length}台
                  </span>
                  <Button size="small" type="text" danger onClick={(e) => { e.stopPropagation(); removePlan(p.id); setPlanCmp(null); if (selPlan === p.id) setSelPlan(null); }}>刪</Button>
                </div>
              ))
            )}
            <Button type="primary" block loading={running} disabled={!plans.length} onClick={runPlan} style={{ marginTop: 12 }}>
              🔌 加入模擬（{plans.length} 棟)
            </Button>
            <div style={{ color: "#999", fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>
              每棟自受電匯流排新拉一路獨立饋線,疊入模型跑潮流,並檢查變壓器/電纜是否過載。
            </div>
          </>
        )}

        {mode === "scenario" && (
        <>
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
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" value={Math.round(total)} onChange={(v) => setTotal(v ?? 0)} />
        <Slider min={base.total_load_kw ? 500 / base.total_load_kw : 0.1} max={3} step={0.05} value={base.total_load_kw ? total / base.total_load_kw : 1} style={{ margin: "2px 4px 20px" }}
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
        </>
        )}
      </Card>

      {/* 中:地圖(過載標紅) */}
      <Card size="small" style={{ height: "100%" }}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {cmp ? "模擬後負載分布" : "現況負載分布"}
            {/* 電網切換 (南/北),與地圖頁一致;南電錶模型開發中就近標示 */}
            {netList.map((n) => (
              <Tag key={n.id} color={n.id === currentNet ? "geekblue" : "default"} style={{ cursor: "pointer", opacity: n.id === currentNet ? 1 : 0.7, fontWeight: 700 }}
                title={DEV_NETS.has(n.id) ? `${n.name}系統開發中,數據為初步建模、尚未校正` : (n.id === currentNet ? "目前檢視的電網" : `切換到${n.name}系統`)}
                onClick={() => switchNet(n.id)}>
                {n.name}{DEV_NETS.has(n.id) && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, opacity: 0.85 }}>· 開發中</span>}
              </Tag>
            ))}
          </span>
        }
        styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}
        extra={
          <span style={{ fontSize: 12, color: "#999" }}>
            <Tag color="#52c41a">正常</Tag><Tag color="#fadb14">中載</Tag><Tag color="#fa8c16">吃緊</Tag><Tag color="#ff4d4f">過載&gt;100%</Tag>
          </span>
        }>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
          {shown && <CampusMapStatic markers={markers} fitHeight hideLegend
            planBuildings={plans}
            placingPlan={mode === "plan" && placing}
            selectedPlanId={selPlan}
            onPlacePlan={mode === "plan" ? placePlan : undefined}
            onSelectPlan={mode === "plan" ? (id) => editPlan(id) : undefined}
            onMovePlan={mode === "plan" ? (id, poly) => updatePlan(id, { poly }) : undefined}
            planRatios={mode === "plan" ? planRatios : undefined} />}
        </div>
      </Card>

      {/* 右:規劃建物規格編輯 / 前後對比 */}
      <Card size="small" title={<span className="cmd-accentbar">{mode === "plan" ? "建物規格" : "修改前 / 後對比"}</span>} style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
        {mode === "plan" ? (
          planCmp ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <b style={{ color: PLAN_COLOR }}>加入 {plans.length} 棟後</b>
                <Button size="small" onClick={() => setPlanCmp(null)}>繼續編輯</Button>
              </div>
              <CompareRow label="總負載" before={planCmp.base.total_load_kw} after={planCmp.scenario.total_load_kw} unit="kW" />
              <CompareRow label="系統損耗" before={planCmp.base.system_loss_kw} after={planCmp.scenario.system_loss_kw} unit="kW" />
              <CompareRow label="最低電壓" before={planCmp.base.min_voltage_pu} after={planCmp.scenario.min_voltage_pu} unit="pu" worseWhenUp={false} />
              <CompareRow label="最大變壓器" before={planCmp.base.max_transformer_load_ratio_percent} after={planCmp.scenario.max_transformer_load_ratio_percent} unit="%" />
              <CompareRow label="最大饋線" before={planCmp.base.max_feeder_load_ratio_percent} after={planCmp.scenario.max_feeder_load_ratio_percent} unit="%" />

              <Divider style={{ margin: "10px 0" }}>額定護欄（{planCmp.warnings.length}）</Divider>
              {planCmp.warnings.length === 0
                ? <div style={{ color: "#3f8600" }}>✓ 新增建物未造成過載或低壓</div>
                : planCmp.warnings.map((w, i) => (
                    <div key={i} style={{ color: w.startsWith("⚠") ? "#cf1322" : "#d46b08", padding: "2px 0", lineHeight: 1.5 }}>{w}</div>
                  ))}

              <Divider style={{ margin: "10px 0" }} orientation="left" plain>新增建物</Divider>
              {planCmp.building_loadings.map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                  <span style={{ fontWeight: 600 }}>{b.name}</span>
                  <span style={{ display: "inline-flex", gap: 10 }}>
                    <span title="最大變壓器負載率" style={{ color: b.load_ratio_percent > 100 ? "#cf1322" : b.load_ratio_percent > 90 ? "#d46b08" : "#3f8600" }}>{b.load_ratio_percent.toFixed(0)}%</span>
                    <span title="最低低壓母線電壓" style={{ color: b.voltage_pu < 0.95 ? "#cf1322" : "#666" }}>{b.voltage_pu.toFixed(3)} pu</span>
                  </span>
                </div>
              ))}

              <Divider style={{ margin: "10px 0" }} orientation="left" plain>新增變壓器</Divider>
              {planCmp.added_transformers.map((t) => (
                <div key={t.transformer_id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>{t.transformer_name}（{t.capacity_kva}kVA）</span>
                  <span style={{ color: t.load_ratio_percent > 100 ? "#cf1322" : t.load_ratio_percent > 90 ? "#d46b08" : "#3f8600" }}>{t.load_ratio_percent.toFixed(0)}%</span>
                </div>
              ))}
              {planCmp.added_feeders.map((f) => (
                <div key={f.feeder_id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#888" }}>
                  <span>{f.feeder_name}</span>
                  <span>{f.load_ratio_percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ) : !sel ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="點地圖上的規劃建物來編輯" style={{ paddingTop: 50 }} /> : (
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#888", marginBottom: 2 }}>名稱</div>
              <Input size="small" value={sel.name} onChange={(e) => updatePlan(sel.id, { name: e.target.value })} style={{ marginBottom: 8 }} />

              <div style={{ color: "#888", marginBottom: 2 }}>用途</div>
              <Select size="small" style={{ width: "100%", marginBottom: 8 }} value={sel.usage}
                onChange={(v) => updatePlan(sel.id, { usage: v })}
                options={USAGE_OPTIONS.map((u) => ({ value: u.value, label: `${u.label}（密度 ${u.density}）` }))} />

              <div style={{ color: "#888", marginBottom: 2 }}>接哪個 VCB</div>
              <Select size="small" style={{ width: "100%", marginBottom: 8 }} placeholder="選 VCB" allowClear showSearch optionFilterProp="label"
                value={sel.vcb ?? undefined} onChange={(v) => updatePlan(sel.id, { vcb: v ?? null })} options={vcbOptions} />

              <div style={{ color: "#888", marginBottom: 2 }}>電纜長度(饋線 tap → 本站)</div>
              <InputNumber size="small" style={{ width: "100%", marginBottom: 8 }} addonAfter="m" min={0}
                value={sel.cableLength_m} onChange={(v) => updatePlan(sel.id, { cableLength_m: v ?? 0 })} />

              <Divider style={{ margin: "8px 0" }} orientation="left" plain>變壓器（{sel.transformers.length}）</Divider>
              {sel.transformers.map((t, i) => (
                <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginBottom: 6, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <b style={{ color: PLAN_COLOR }}>TR{i + 1}</b>
                    <Button size="small" type="text" danger disabled={sel.transformers.length <= 1}
                      onClick={() => updatePlan(sel.id, { transformers: sel.transformers.filter((_, j) => j !== i) })}>移除</Button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <Select size="small" value={t.capacity_kva} onChange={(v) => updatePlan(sel.id, { transformers: sel.transformers.map((x, j) => j === i ? { ...x, capacity_kva: v } : x) })}
                      options={KVA_OPTIONS.map((k) => ({ value: k, label: `${k} kVA` }))} />
                    <Select size="small" value={t.lv_voltage} onChange={(v) => updatePlan(sel.id, { transformers: sel.transformers.map((x, j) => j === i ? { ...x, lv_voltage: v } : x) })}
                      options={LV_OPTIONS.map((k) => ({ value: k, label: `${k} kV` }))} />
                    <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={0} value={t.load_kw}
                      onChange={(v) => updatePlan(sel.id, { transformers: sel.transformers.map((x, j) => j === i ? { ...x, load_kw: v ?? 0 } : x) })} />
                    <InputNumber size="small" style={{ width: "100%" }} prefix="pf" min={0} max={1} step={0.01} value={t.pf}
                      onChange={(v) => updatePlan(sel.id, { transformers: sel.transformers.map((x, j) => j === i ? { ...x, pf: v ?? 0.9 } : x) })} />
                  </div>
                </div>
              ))}
              <Button size="small" block style={{ marginBottom: 12 }} onClick={() => updatePlan(sel.id, { transformers: appendTransformer(sel) })}>＋ 新增變壓器</Button>

              <div style={{ color: "#999", fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                填好規格後,按左側「加入模擬」把所有規劃建物一起疊入模型跑潮流。
              </div>
              <Button block danger onClick={() => { removePlan(sel.id); setSelPlan(null); }}>刪除此建物</Button>
            </div>
          )
        ) : !cmp ? <Empty description="設定左側參數後按「執行模擬」" style={{ paddingTop: 50 }} /> : (
          <>
            <CompareRow label="總負載" before={cmp.base.total_load_kw} after={cmp.scenario.total_load_kw} unit="kW" />
            <CompareRow label="系統損耗" before={cmp.base.system_loss_kw} after={cmp.scenario.system_loss_kw} unit="kW" />
            <CompareRow label="　鐵損(空載)" before={cmp.base.iron_loss_kw} after={cmp.scenario.iron_loss_kw} unit="kW" />
            <CompareRow label="　銅損(負載)" before={cmp.base.copper_loss_kw} after={cmp.scenario.copper_loss_kw} unit="kW" />
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
