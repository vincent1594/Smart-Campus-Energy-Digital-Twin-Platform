import { Alert, Button, Card, Segmented, Spin, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getNetwork, setNetwork } from "../api/client";
import type { BuildingSummary, DashboardSummary, PowerFlowResult, TopologyGraph, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import FeedbackButton from "../components/FeedbackButton";
import FocusPanel from "../components/FocusPanel";
import SingleLineSvg from "../components/SingleLineSvg";
import StatsPanel from "../components/StatsPanel";
import { useFocus, type FocusKind } from "../focus/FocusContext";
import { BUILDING_POS, SOURCE_KEY, SOURCE_LETTER_BY_NET, buildingLetter, netOfLetter, type Pt } from "../lib/campusPositions";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import { useTheme } from "../theme/ThemeContext";


// 兩張小時快照線性內插 → 連續拖曳時面板數字平滑變化(KPI、各設備負載率、電壓皆內插)
function lerpSnap(a: PowerFlowResult, b: PowerFlowResult, t: number): PowerFlowResult {
  const L = (x: number, y: number) => x + (y - x) * t;
  const bTr = new Map(b.transformer_loadings.map((x) => [x.transformer_id, x.load_ratio_percent]));
  const bFd = new Map(b.feeder_loadings.map((x) => [x.feeder_id, x.load_ratio_percent]));
  const bBv = new Map(b.building_voltages.map((x) => [x.building_id, x.voltage_pu]));
  const minV = L(a.min_voltage_pu, b.min_voltage_pu);
  const maxTr = L(a.max_transformer_load_ratio_percent, b.max_transformer_load_ratio_percent);
  return {
    ...a,
    total_load_kw: L(a.total_load_kw, b.total_load_kw),
    total_load_kvar: L(a.total_load_kvar, b.total_load_kvar),
    system_loss_kw: L(a.system_loss_kw, b.system_loss_kw),
    system_loss_kvar: L(a.system_loss_kvar, b.system_loss_kvar),
    grid_import_kw: L(a.grid_import_kw, b.grid_import_kw),
    grid_import_kvar: L(a.grid_import_kvar, b.grid_import_kvar),
    min_voltage_pu: minV,
    max_transformer_load_ratio_percent: maxTr,
    max_feeder_load_ratio_percent: L(a.max_feeder_load_ratio_percent, b.max_feeder_load_ratio_percent),
    status: maxTr > 100 || minV < 0.95 ? "WARNING" : "OK",
    transformer_loadings: a.transformer_loadings.map((x) => ({ ...x, load_ratio_percent: L(x.load_ratio_percent, bTr.get(x.transformer_id) ?? x.load_ratio_percent) })),
    feeder_loadings: a.feeder_loadings.map((x) => ({ ...x, load_ratio_percent: L(x.load_ratio_percent, bFd.get(x.feeder_id) ?? x.load_ratio_percent) })),
    building_voltages: a.building_voltages.map((x) => ({ ...x, voltage_pu: L(x.voltage_pu, bBv.get(x.building_id) ?? x.voltage_pu) })),
  };
}

// 地圖範圍編輯工具(編輯範圍/匯出座標):座標已排定,平時隱藏;需重新調整時改回 true。
const SHOW_EDIT_TOOLS = false;

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
  const [daySnapshots, setDaySnapshots] = useState<PowerFlowResult[]>();   // 歷史尖峰日 24h 實測快照
  const [dayDate, setDayDate] = useState<string>();                        // 該日日期(歷史尖峰最高日)
  const [dayPeakHour, setDayPeakHour] = useState<number>();                // 該日尖峰小時
  const [selectedHour, setSelectedHour] = useState<number | null>(null);   // 日曲線拖曳到的時段(null=基準)
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("bg_guide_seen"));   // 第一次使用提示
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([]);   // 可切換電網 (南/北)
  const [currentNet, setCurrentNet] = useState(getNetwork());   // 當前電網 (state → 切換不刷頁,觸發重抓資料重繪)
  const srcLetter = SOURCE_LETTER_BY_NET[currentNet] ?? null;   // 當前網受電站字母 (北 X / 南 H1)
  // 地圖恆顯示南北所有建物;點他系統建物即自動切到該系統。ovData = 各系統 base 潮流(供「非作用中」系統著色)。
  const [ovData, setOvData] = useState<Record<string, { buildings: BuildingSummary[]; pf: PowerFlowResult }>>({});
  useEffect(() => { api.networks().then(setNetworks).catch(() => undefined); }, []);

  useEffect(() => {
    let alive = true;
    const ids = networks.length ? networks.map((n) => n.id) : ["north", "south"];
    Promise.all(ids.map(async (id) => [id, {
      buildings: await api.buildingsOf(id), pf: await api.powerflowOf(id),
    }] as const))
      .then((entries) => { if (alive) setOvData(Object.fromEntries(entries)); })
      .catch(() => { /* 抓取失敗 → 維持空,地圖退化為只顯示作用中系統 */ });
    return () => { alive = false; };
  }, [networks]);
  const [editing, setEditing] = useState(false);                       // 地圖範圍編輯模式
  const [polys, setPolys] = useState<Record<string, Pt[]> | null>(null);  // 編輯中的多邊形(含南網新建物)
  const dismissGuide = () => { localStorage.setItem("bg_guide_seen", "1"); setShowGuide(false); };

  // 切換電網 (currentNet 變動) → 重抓該網資料並重繪;不刷頁。切換時先清掉上一網的時段/情境/錯誤殘留。
  useEffect(() => {
    setErr(undefined); setSelectedHour(null); setScenario(null);
    setDaySnapshots(undefined); setDayDate(undefined); setDayPeakHour(undefined);
    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers(), api.topology()])
      .then(([d, p, b, t, g]) => { setDash(d); setPf(p); setBuildings(b); setTrafos(t); setGraph(g); })
      .catch((e) => setErr(String(e.message ?? e)));
    // base 已是尖峰日(4220),不必覆蓋;僅載入 24h 快照供拖曳看各時段。
    // 日曲線為加值功能(依賴 forecast):某些電網未備(如南電錶)時靜默略過,不讓整頁報錯。
    api.forecastDay().then((r) => { setDaySnapshots(r.snapshots); setDayDate(r.date); setDayPeakHour(r.peak_hour); })
      .catch(() => { /* 日曲線不可用 → 不顯示拖曳時段,基準潮流照常 */ });
  }, [currentNet]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 「還原基準」= 清除時段覆蓋,回到平台 base(=尖峰日 4220)
  const clearHour = () => { setSelectedHour(null); setScenario(null); };

  // 連續拖曳日曲線基準點(hour 可為小數)→ 相鄰兩小時快照內插 → 灌入情境覆蓋通道,全面板平滑即時連動
  const scrubHour = (hour: number) => {
    if (!daySnapshots) return;
    const lo = Math.max(0, Math.min(23, Math.floor(hour)));
    const hi = Math.min(23, lo + 1);
    const t = hour - lo;
    setSelectedHour(hour);
    setScenario(t > 0.0001 && daySnapshots[hi] ? lerpSnap(daySnapshots[lo], daySnapshots[hi], t) : (daySnapshots[lo] ?? null), "time");
  };

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
      const L = buildingLetter(b.id, currentNet);
      if (!zones.has(L)) { zones.set(L, { name: b.name.replace(/\s*\(.*\)/, ""), ratio: null }); repLoadByLetter.set(L, b.id); }
      const t = trafoByName.get(b.transformer_name);
      const r = ratioById.get(b.transformer_name) ?? null;
      if (r != null) { const z = zones.get(L)!; z.ratio = Math.max(z.ratio ?? 0, r); }
      push(lettersByTrafo, b.transformer_name, L);
      push(lettersByFeeder, t?.feeder_id, L);
      if (t?.vcb_id) { push(lettersByVcb, t.vcb_id, L); if (!vcbOfLetter.has(L)) vcbOfLetter.set(L, t.vcb_id); }
    }
    return { zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, repLoadByLetter };
  }, [buildings, trafoByName, scenario, pf, currentNet]);

  const markers: MapMarker[] = useMemo(() => {
    const zs = [...zones.entries()].map(([letter, z]) => ({ letter, name: z.name, ratio: z.ratio }));
    // 受電站:只顯示當前系統者 (北 X / 南 H1)。若受電站本身即一棟負載建物 (南網 H1) 則已在清單,不重複加。
    const needSrc = srcLetter && !zs.some((m) => m.letter === srcLetter);
    return [...(needSrc ? [{ letter: srcLetter as string, name: `受電站(${srcLetter}棟)`, ratio: null }] : []), ...zs];
  }, [zones, srcLetter]);

  // 地圖標記 = 作用中系統(用即時 scenario 著色,含其受電站) + 其他系統(用各自 base 潮流著色)。
  // 各標記帶 net 以畫系統識別外框;同字母以作用中系統優先(不重複)。
  const { allMarkers, repByLetterAll } = useMemo(() => {
    const out: MapMarker[] = markers.map((m) => ({ ...m, net: currentNet }));
    const present = new Set(out.map((m) => m.letter));
    const rep = new Map<string, string>();
    for (const b of buildings) if (!rep.has(buildingLetter(b.id))) rep.set(buildingLetter(b.id), b.id);
    for (const [net, d] of Object.entries(ovData)) {
      if (net === currentNet) continue;   // 作用中系統已用上面 scenario-aware 的 markers
      const ratioById = new Map(d.pf?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
      const seen = new Map<string, MapMarker>();
      for (const b of d.buildings) {
        const L = buildingLetter(b.id);
        if (!rep.has(L)) rep.set(L, b.id);
        if (present.has(L)) continue;
        let mk = seen.get(L);
        if (!mk) { mk = { letter: L, name: b.name.replace(/\s*\(.*\)/, ""), ratio: null, net }; seen.set(L, mk); out.push(mk); }
        const r = ratioById.get(b.transformer_name);
        if (r != null) mk.ratio = Math.max(mk.ratio ?? 0, r);
      }
      const src = SOURCE_LETTER_BY_NET[net];   // 他系統受電站(北 X 非建物需另加;南 H1 本身即建物)
      if (src && !present.has(src) && !seen.has(src)) out.push({ letter: src, name: `受電站(${src}棟)`, ratio: null, net });
    }
    return { allMarkers: out, repByLetterAll: rep };
  }, [markers, buildings, ovData, currentNet]);

  // 點建物 → 依字母判斷所屬系統。他系統:自動切過去並聚焦該建物;同系統:沿用原本 supply/impact 行為。
  const onMapSelectAny = (letter: string) => {
    const targetNet = netOfLetter(letter);
    if (targetNet === currentNet) { onMapSelect(letter); return; }
    setNetwork(targetNet); setCurrentNet(targetNet);
    // 兼建物的受電站(南 H1)→ 顯示建物卡片;純受電站(北 X)→ 聚焦受電站
    const rep = repByLetterAll.get(letter);
    if (rep) setFocus({ kind: "building", id: rep, label: `${letter}棟` });
    else if (letter === SOURCE_LETTER_BY_NET[targetNet]) setFocus({ kind: "source", id: SOURCE_KEY, label: `受電站(${letter}棟)` });
  };

  // 進入編輯模式:只處理「當前網路」的建物 (避免南網編輯混入北網建物、匯出也只含當前網)。
  // 已有座標者沿用 BUILDING_POS;尚無座標者 (南網 H1/H2/H6/E/U/O,受電站=H1) 給左側暫存區預設方框,拖到實際位置。
  const seedPolys = (): Record<string, Pt[]> => {
    const seeded: Record<string, Pt[]> = {};
    let i = 0;
    for (const m of markers) {
      const existing = BUILDING_POS[m.letter];
      if (existing) {
        seeded[m.letter] = existing.map((p) => [p[0], p[1]] as Pt);
      } else {
        const y = 120 + i * 70;
        seeded[m.letter] = [[40, y], [150, y], [150, y + 50], [40, y + 50]];
        i++;
      }
    }
    return seeded;
  };
  const toggleEdit = () => {
    if (!editing) { setPolys(seedPolys()); setCenterView("map"); setFocus(null); setEditing(true); }
    else { setEditing(false); }
  };
  const exportPolys = async () => {
    const text = JSON.stringify(polys ?? BUILDING_POS, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      message.success("座標已複製到剪貼簿 — 貼回 src/lib/campusPositions.ts 的 BUILDING_POS 即永久生效");
    } catch {
      console.log(text);
      message.info("自動複製失敗,座標已輸出至主控台 (F12 Console)");
    }
  };

  const { focusLetter, highlight, emphasize } = useMemo(() => {
    const empty = new Set<string>();
    if (!focus) return { focusLetter: null as string | null, highlight: empty, emphasize: empty };
    // 受電站聚焦:標出當前系統的受電站 (北 X / 南 H1) 並高亮全系統建物
    if (focus.kind === "source") return { focusLetter: srcLetter, highlight: new Set(zones.keys()), emphasize: empty };
    if (focus.kind === "building") {
      const L = buildingLetter(focus.id, currentNet);
      const vcbGroup = lettersByVcb.get(vcbOfLetter.get(L) ?? "") ?? empty;
      // 受電站建物(南 H1 / 北 X):全系統淡亮(受電站角色)+ 同 VCB 群(H1/H2)再強調;其餘建物只亮同 VCB 群
      if (L === srcLetter) return { focusLetter: L, highlight: new Set(zones.keys()), emphasize: vcbGroup };
      return { focusLetter: L, highlight: vcbGroup, emphasize: empty };
    }
    if (focus.kind === "transformer") return { focusLetter: null, highlight: lettersByTrafo.get(focus.id) ?? empty, emphasize: empty };
    if (focus.kind === "feeder") return { focusLetter: null, highlight: lettersByFeeder.get(focus.id) ?? empty, emphasize: empty };
    return { focusLetter: null, highlight: lettersByVcb.get(focus.id) ?? empty, emphasize: empty };
  }, [focus, zones, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, srcLetter, currentNet]);

  const onMapSelect = (letter: string) => {
    const rep = repLoadByLetter.get(letter);
    // 純受電站(北 X,本身非負載建物)→ 聚焦受電站、整個系統亮起;受電站兼建物(南 H1)→ 照常顯示建物卡片
    if (letter === srcLetter && !rep) { setFocus({ kind: "source", id: SOURCE_KEY, label: `受電站(${srcLetter}棟)` }); return; }
    if (mode === "supply") { if (rep) setFocus({ kind: "building", id: rep, label: `${letter}棟` }); }
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}
      onClick={(e) => { if (focus && !(e.target as HTMLElement).closest("[data-focus-keep]")) setFocus(null); }}>
      {/* 點任何「非互動背景」清除焦點;互動區(地圖、右欄焦點詳情、日曲線)標 data-focus-keep 保留 */}
      {/* V1 範圍/可信度聲明(連驗證中心)+ 第一次使用提示(接在後面,看過/關閉後不再出現) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px", background: "#e6f4ff", border: "1px solid #91caff", borderRadius: 6, fontSize: 13, lineHeight: 1.5, color: "#0958d9", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, background: "#0958d9", color: "#fff", borderRadius: 3, padding: "0 6px", fontSize: 12 }}>V1</span>
        <span style={{ color: "#333" }}>部分數值為規劃估算、模型涵蓋北電錶區。各數據來源與待校正項目請見</span>
        <a style={{ fontWeight: 600 }} onClick={() => navigate("/verify")}>驗證中心 →</a>
        {showGuide && (
          <>
            <span style={{ color: "#91caff" }}>·</span>
            <span style={{ color: "#389e0d" }}>👋 第一次使用?{" "}
              <a style={{ fontWeight: 600, color: "#237804" }}
                onClick={() => { dismissGuide(); navigate("/report", { state: { tab: "guide" } }); }}>到「報表匯出 → 使用說明」看操作指南 →</a>
            </span>
            <a onClick={dismissGuide} title="不再顯示" style={{ color: "#52c41a", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>×</a>
          </>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#555", fontSize: 12, whiteSpace: "nowrap" }}>用得順手嗎?歡迎留下您的</span>
          <FeedbackButton />
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px 1fr 360px", gap: 10 }}>
      {/* 左:狀態 + KPI 面板 */}
      <div style={{ height: "100%", overflow: "hidden" }}>
        <StatsPanel dash={effDash} pf={effPf} dark={dark} daySnapshots={daySnapshots} curveDate={dayDate} peakHour={dayPeakHour} selectedHour={selectedHour} onScrubHour={scrubHour} />
      </div>

      {/* 中:地圖 / 單線圖 切換 */}
      <div data-focus-keep style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #eef1f5", borderRadius: 12, boxShadow: "0 1px 4px rgba(20,40,80,.05)", overflow: "hidden" }}>
        <div style={{ padding: "7px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f2f5", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{centerView === "map" ? "校園供電地圖" : "高壓配電單線圖"}{" "}
            {(networks.length ? networks : [{ id: currentNet, name: currentNet === "south" ? "南電錶" : "北電錶" }]).map((n) => (
              <Tag key={n.id} color={n.id === currentNet ? "geekblue" : "default"}
                style={{ cursor: "pointer", opacity: n.id === currentNet ? 1 : 0.7 }}
                title={n.id === currentNet ? "點選聚焦受電站、高亮整個系統" : `切換到${n.name}系統(也可直接點該系統建物)`}
                onClick={() => {
                  if (n.id !== currentNet) { setNetwork(n.id); setCurrentNet(n.id); setEditing(false); }   // 切換:更新 state 觸發重抓重繪,不刷頁
                  // 一鍵聚焦該系統受電站(免點兩次),且與該受電站建物綁定:
                  // 南 H1 本身是建物 → 聚焦 H1(卡片含建物+受電站、全系統亮+H1/H2 強調);北 X 純受電站 → 聚焦受電站。
                  const sl = SOURCE_LETTER_BY_NET[n.id];
                  const rep = repByLetterAll.get(sl);
                  if (rep) setFocus({ kind: "building", id: rep, label: `${sl}棟` });
                  else setFocus({ kind: "source", id: SOURCE_KEY, label: `受電站(${sl}棟)` });
                }}>
                {n.name}系統
              </Tag>
            ))}
            {selectedHour != null
              ? (dayPeakHour != null && Math.round(selectedHour) !== dayPeakHour
                  ? <Tag color="cyan">🕒 {String(Math.round(selectedHour)).padStart(2, "0")}:00 · <a onClick={clearHour}>還原基準</a></Tag>
                  : null)
              : scenario && <Tag color="orange">模擬情境 <a onClick={() => setScenario(null)}>還原現況</a></Tag>}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!editing && centerView === "map" && (
              <Segmented size="small" value={mode} onChange={(v) => setMode(v as "supply" | "impact")}
                options={[{ label: "查供電路徑", value: "supply" }, { label: "看停電影響", value: "impact" }]} />
            )}
            {!editing && (
              <Segmented size="small" value={centerView} onChange={(v) => setCenterView(v as "map" | "single")}
                options={[{ label: "地圖", value: "map" }, { label: "單線圖", value: "single" }]} />
            )}
            {SHOW_EDIT_TOOLS && editing && <Button size="small" onClick={exportPolys}>匯出座標</Button>}
            {SHOW_EDIT_TOOLS && (
              <Button size="small" type={editing ? "primary" : "default"} onClick={toggleEdit}
                title="拖頂點移動、雙擊邊加點、雙擊頂點刪點;南網新建物在左側暫存區,拖到實際位置">
                {editing ? "完成編輯" : "編輯範圍"}
              </Button>
            )}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center", padding: 8 }}>
          {centerView === "map"
            ? <CampusMapStatic markers={editing ? markers : allMarkers} focusLetter={focusLetter} highlight={highlight} emphasize={emphasize}
                sourceLetter={focus && focus.kind !== "source" ? srcLetter : null} outage={focus?.kind === "vcb"}
                onSelect={onMapSelectAny} onClear={() => setFocus(null)} dark={dark} fitHeight
                editable={editing} polys={editing ? (polys ?? undefined) : undefined}
                onPolyChange={(letter, pts) => setPolys((p) => ({ ...(p ?? {}), [letter]: pts }))} />
            : graph
              ? <SingleLineSvg graph={graph} pf={effPf} selectedId={focus?.id ?? null} onSelect={(n) => setFocus({ kind: n.kind as FocusKind, id: n.id, label: n.id })} />
              : <Spin />}
        </div>
      </div>

      {/* 右:焦點面板 */}
      <Card data-focus-keep size="small" title="焦點詳情" style={{ height: "100%", overflow: "hidden", borderRadius: 12, border: "1px solid #eef1f5", boxShadow: "0 1px 4px rgba(20,40,80,.05)" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <FocusPanel buildings={buildings} trafos={trafos} dash={dash} />
      </Card>
      </div>
    </div>
  );
}
