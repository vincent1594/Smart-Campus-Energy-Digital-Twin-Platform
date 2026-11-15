import { Alert, Button, Card, Segmented, Spin, Tag, message, type TableColumnsType } from "antd";
import Table from "../components/ResizableTable";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getNetwork, setNetwork } from "../api/client";
import type { BuildingSummary, BusFlow, DashboardSummary, PowerFlowResult, TopologyGraph, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import FeedbackButton from "../components/FeedbackButton";
import FocusPanel from "../components/FocusPanel";
import SingleLineSvg from "../components/SingleLineSvg";
import StatsPanel from "../components/StatsPanel";
import { useFocus, type FocusKind } from "../focus/FocusContext";
import { BUILDING_POS, DEV_NETS, SOURCE_KEY, SOURCE_LETTER_BY_NET, buildingLetter, netOfLetter, type Pt } from "../lib/campusPositions";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";
import { useTheme } from "../theme/ThemeContext";


// 兩張小時快照線性內插 → 連續拖曳時面板數字平滑變化(KPI、各設備負載率、電壓皆內插)
function lerpSnap(a: PowerFlowResult, b: PowerFlowResult, t: number): PowerFlowResult {
  const L = (x: number, y: number) => x + (y - x) * t;
  const bTr = new Map(b.transformer_loadings.map((x) => [x.transformer_id, x.load_ratio_percent]));
  const bFd = new Map(b.feeder_loadings.map((x) => [x.feeder_id, x.load_ratio_percent]));
  const bBv = new Map(b.building_voltages.map((x) => [x.building_id, x.voltage_pu]));
  const bBus = new Map((b.bus_flows ?? []).map((x) => [x.bus_name, x]));   // 母線潮流:依 bus_name 對齊兩時段
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
    // 母線潮流隨時段連動:電壓大小/相角/P/Q(含負載Q、電容Q拆解)兩時段線性內插 (bus_type/vn_kv 沿用)
    bus_flows: a.bus_flows?.map((x) => {
      const y = bBus.get(x.bus_name);
      return y ? { ...x, vm_pu: L(x.vm_pu, y.vm_pu), va_degree: L(x.va_degree, y.va_degree), p_kw: L(x.p_kw, y.p_kw),
        q_kvar: L(x.q_kvar, y.q_kvar),
        load_q_kvar: L(x.load_q_kvar ?? 0, y.load_q_kvar ?? 0),
        shunt_q_kvar: L(x.shunt_q_kvar ?? 0, y.shunt_q_kvar ?? 0) } : x;
    }),
  };
}

// 地圖範圍編輯工具(編輯範圍/匯出座標):座標已排定,平時隱藏;需重新調整時改回 true。
const SHOW_EDIT_TOOLS = false;
// 第一次使用提示的「已看過」記號。改版號(v2→v3…)= 讓所有訪客(含已關閉者)重新看到一次提示
const GUIDE_KEY = "bg_guide_seen_v2";

export default function MapExplorer() {
  const navigate = useNavigate();
  const { focus, setFocus } = useFocus();
  const { scenario: rawScenario, scenarioKind: rawKind, scenarioNet, setScenario } = useActiveScenario();
  const { dark } = useTheme();
  const [mode, setMode] = useState<"supply" | "impact">("supply");
  const [centerView, setCenterView] = useState<"map" | "single" | "bus">("map");
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
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_KEY));   // 第一次使用提示
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([]);   // 可切換電網 (南/北)
  const [currentNet, setCurrentNet] = useState(getNetwork());   // 當前電網 (state → 切換不刷頁,觸發重抓資料重繪)
  const [loadedNet, setLoadedNet] = useState(getNetwork());     // 作用中系統「已完成載入」的電網 (pf/buildings 對應誰);切換瞬間 ≠ currentNet → 暫不採用即時著色,避免沿用上一網殘留閃動
  const srcLetter = SOURCE_LETTER_BY_NET[currentNet] ?? null;   // 當前網受電站字母 (北 X / 南 H1)
  // 分別連動:情境僅在其所屬電網生效;跨網檢視時視為現況,避免北電網的模擬套到南電網總覽(切回原網即重現)。
  const scenario = rawScenario && scenarioNet === currentNet ? rawScenario : null;
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
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);  // 跨電網點選:待新網資料就緒再套用的字母
  const [polys, setPolys] = useState<Record<string, Pt[]> | null>(null);  // 編輯中的多邊形(含南網新建物)
  const dismissGuide = () => { localStorage.setItem(GUIDE_KEY, "1"); setShowGuide(false); };

  // 各電網主資料快取(dash/pf/buildings/trafos/graph)→ 切回已看過的電網即時套用,免重抓、連動高亮無延遲。
  const netCache = useRef<Record<string, { dash: DashboardSummary; pf: PowerFlowResult; buildings: BuildingSummary[]; trafos: TransformerDetail[]; graph: TopologyGraph }>>({});
  const dayCache = useRef<Record<string, { snapshots: PowerFlowResult[]; date: string; peakHour: number }>>({});

  // 切換電網 (currentNet 變動) → 有快取先即時套用(切換無感),背景仍重新抓取驗證;不刷頁。切換時清掉上一網的時段/情境/錯誤殘留。
  useEffect(() => {
    const net = currentNet;
    setErr(undefined); setSelectedHour(null);
    // 切網只清「時段檢視」(隨拖曳、綁定 selectedHour);規劃模擬(whatif)保留 → 切回原網仍連動。
    if (rawKind === "time") setScenario(null);
    const cached = netCache.current[net];
    if (cached) { setDash(cached.dash); setPf(cached.pf); setBuildings(cached.buildings); setTrafos(cached.trafos); setGraph(cached.graph); setLoadedNet(net); }
    const dcached = dayCache.current[net];
    if (dcached) { setDaySnapshots(dcached.snapshots); setDayDate(dcached.date); setDayPeakHour(dcached.peakHour); }
    else { setDaySnapshots(undefined); setDayDate(undefined); setDayPeakHour(undefined); }

    Promise.all([api.dashboard(), api.powerflow(), api.buildings(), api.transformers(), api.topology()])
      .then(([d, p, b, t, g]) => {
        netCache.current[net] = { dash: d, pf: p, buildings: b, trafos: t, graph: g };
        if (getNetwork() !== net) return;   // 抓取期間又切走 → 不覆蓋當前畫面
        setDash(d); setPf(p); setBuildings(b); setTrafos(t); setGraph(g); setLoadedNet(net);
      })
      .catch((e) => { if (getNetwork() === net) setErr(String(e.message ?? e)); });
    // base 已是尖峰日(4220),不必覆蓋;僅載入 24h 快照供拖曳看各時段。
    // 日曲線為加值功能(依賴 forecast):某些電網未備(如南電錶)時靜默略過,不讓整頁報錯。已快取則免抓。
    if (!dcached) {
      api.forecastDay().then((r) => {
        dayCache.current[net] = { snapshots: r.snapshots, date: r.date, peakHour: r.peak_hour };
        if (getNetwork() !== net) return;
        setDaySnapshots(r.snapshots); setDayDate(r.date); setDayPeakHour(r.peak_hour);
      }).catch(() => { /* 日曲線不可用 → 不顯示拖曳時段,基準潮流照常 */ });
    }
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
    setScenario(t > 0.0001 && daySnapshots[hi] ? lerpSnap(daySnapshots[lo], daySnapshots[hi], t) : (daySnapshots[lo] ?? null), "time", currentNet);
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

  // 地圖標記恆由 ovData(各系統 base,已含全部南北建物)驅動 → 切換系統時建物集合穩定,不因作用中系統
  // 資料重抓而閃動。作用中系統:其資料已完成載入(loadedNet 相符)時改用即時 scenario/pf 著色(支援日曲線
  // 拖曳即時連動);切換瞬間(loadedNet≠currentNet,pf 仍屬上一網)則退用該系統 base 潮流著色,避免殘留閃動。
  // 各字母在南北兩網互斥(SOUTH_LETTERS),故以 ovData 逐網填入即不重複;純受電站(北 X 非建物)另加。
  const { allMarkers, repByLetterAll, activeLetters } = useMemo(() => {
    const out: MapMarker[] = [];
    const rep = new Map<string, string>();
    const seen = new Map<string, MapMarker>();
    const active = new Set<string>();
    const live = loadedNet === currentNet ? (scenario ?? pf) : undefined;   // 作用中系統即時著色來源(尚未載入則不採用)
    const ids = networks.length ? networks.map((n) => n.id) : Object.keys(ovData);
    for (const net of ids) {
      const d = ovData[net];
      if (!d) continue;
      const result = net === currentNet && live ? live : d.pf;
      const ratioById = new Map(result?.transformer_loadings.map((t) => [t.transformer_id, t.load_ratio_percent]) ?? []);
      for (const b of d.buildings) {
        const L = buildingLetter(b.id);
        if (!rep.has(L)) rep.set(L, b.id);
        if (net === currentNet) active.add(L);
        let mk = seen.get(L);
        if (!mk) { mk = { letter: L, name: b.name.replace(/\s*\(.*\)/, ""), ratio: null, net }; seen.set(L, mk); out.push(mk); }
        const r = ratioById.get(b.transformer_name);
        if (r != null) mk.ratio = Math.max(mk.ratio ?? 0, r);
      }
      const src = SOURCE_LETTER_BY_NET[net];   // 受電站:北 X 非建物需另加;南 H1 本身即建物(已在清單)
      if (src) { if (net === currentNet) active.add(src); if (!seen.has(src)) { const mk = { letter: src, name: `受電站(${src}棟)`, ratio: null, net }; seen.set(src, mk); out.push(mk); } }
    }
    return { allMarkers: out, repByLetterAll: rep, activeLetters: active };
  }, [ovData, networks, currentNet, loadedNet, scenario, pf]);

  // 點建物 → 依字母判斷所屬系統。他系統:自動切過去並聚焦該建物;同系統:沿用原本 supply/impact 行為。
  const onMapSelectAny = (letter: string) => {
    const targetNet = netOfLetter(letter);
    if (targetNet === currentNet) { onMapSelect(letter); return; }
    // 切到他系統:該網資料為非同步載入,此刻 vcbOfLetter 等仍是舊網、解不出新網 VCB。
    // 故記下待處理字母,待資料就緒(loadedNet 追上 currentNet)再走 onMapSelect,行為與同網一致、
    // 且自動尊重 supply/impact 模式(修正:看停電影響下跨電網點建物要點兩次才變紅)。
    setNetwork(targetNet); setCurrentNet(targetNet); setPendingSelect(letter);
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
    // 受電站聚焦:標出當前系統的受電站 (北 X / 南 H1) 並高亮全系統建物。
    // 全系統建物集合用 activeLetters(由 ovData 導出,切換系統時穩定),不用 zones.keys()(隨 buildings 重抓而延遲 → 聚光燈閃動)。
    if (focus.kind === "source") return { focusLetter: srcLetter, highlight: activeLetters, emphasize: empty };
    if (focus.kind === "building") {
      const L = buildingLetter(focus.id, currentNet);
      const vcbGroup = lettersByVcb.get(vcbOfLetter.get(L) ?? "") ?? empty;
      // 受電站建物(南 H1 / 北 X):全系統淡亮(受電站角色)+ 同 VCB 群(H1/H2)再強調;其餘建物只亮同 VCB 群
      if (L === srcLetter) return { focusLetter: L, highlight: activeLetters, emphasize: vcbGroup };
      return { focusLetter: L, highlight: vcbGroup, emphasize: empty };
    }
    if (focus.kind === "transformer") return { focusLetter: null, highlight: lettersByTrafo.get(focus.id) ?? empty, emphasize: empty };
    if (focus.kind === "feeder") return { focusLetter: null, highlight: lettersByFeeder.get(focus.id) ?? empty, emphasize: empty };
    return { focusLetter: null, highlight: lettersByVcb.get(focus.id) ?? empty, emphasize: empty };
  }, [focus, activeLetters, lettersByVcb, lettersByTrafo, lettersByFeeder, vcbOfLetter, srcLetter, currentNet]);

  const onMapSelect = (letter: string) => {
    const rep = repLoadByLetter.get(letter);
    // 純受電站(北 X,本身非負載建物)→ 聚焦受電站、整個系統亮起;受電站兼建物(南 H1)→ 照常顯示建物卡片
    if (letter === srcLetter && !rep) { setFocus({ kind: "source", id: SOURCE_KEY, label: `受電站(${srcLetter}棟)` }); return; }
    if (mode === "supply") { if (rep) setFocus({ kind: "building", id: rep, label: `${letter}棟` }); }
    else { const v = vcbOfLetter.get(letter); if (v) setFocus({ kind: "vcb", id: v, label: trafos.find((t) => t.vcb_id === v)?.vcb_name ?? v }); }
  };

  // 跨電網待處理選取:待新網資料就緒(loadedNet 追上 currentNet,vcbOfLetter 已重算)再套用,
  // 此時 onMapSelect 才解得出該建物的 VCB → 停電影響一次點擊即變紅。
  useEffect(() => {
    if (pendingSelect && loadedNet === currentNet) {
      onMapSelect(pendingSelect);
      setPendingSelect(null);
    }
  }, [pendingSelect, loadedNet, currentNet, vcbOfLetter]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Alert type="error" message="無法載入" description={err} showIcon />;
  if (!dash || !pf) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  const effPf = scenario ?? pf;
  // 母線潮流表:優先用作用中潮流(規劃情境會反映);時段拖曳的靜態快照無此欄則退回 base pf。
  const busFlows: BusFlow[] = effPf?.bus_flows ?? pf?.bus_flows ?? [];
  const slackCount = busFlows.filter((b) => b.bus_type === "Slack").length;
  // 母線功因:由淨注入 P/Q 求 |P|/√(P²+Q²)。同號=滯後(電感性)、異號或純電容=超前(電容性)。
  // 無載/純接點(S≈0)→ 無意義,回 null 顯示「—」。
  const pfInfo = (p: number, q: number): { v: number; lead: boolean } | null => {
    const s = Math.hypot(p, q);
    if (s < 0.05) return null;
    return { v: Math.abs(p) / s, lead: p * q < 0 || (Math.abs(p) < 0.05 && q < 0) };
  };
  const busColumns: TableColumnsType<BusFlow> = [
    { title: "母線", dataIndex: "bus_name", key: "bus_name", ellipsis: true,
      render: (v: string, r: BusFlow) => <span style={{ fontSize: 12 }}>{v}<span style={{ color: "#bbb", marginLeft: 6 }}>{r.vn_kv}kV</span></span> },
    { title: "類型", dataIndex: "bus_type", key: "bus_type", width: 74,
      filters: [{ text: "Slack", value: "Slack" }, { text: "PV", value: "PV" }, { text: "PQ", value: "PQ" }],
      onFilter: (val, r) => r.bus_type === val,
      render: (t: string) => t === "Slack" ? <Tag color="gold">Slack</Tag> : t === "PV" ? <Tag color="green">PV</Tag> : <Tag>PQ</Tag> },
    { title: "電壓 pu", dataIndex: "vm_pu", key: "vm_pu", width: 82,
      sorter: (a, b) => a.vm_pu - b.vm_pu,
      render: (v: number) => <span style={{ color: v < 0.95 || v > 1.05 ? "#cf1322" : (dark ? "#ddd" : "#333") }}>{v.toFixed(4)}</span> },
    { title: "相角 °", dataIndex: "va_degree", key: "va_degree", width: 74,
      sorter: (a, b) => a.va_degree - b.va_degree, render: (v: number) => v.toFixed(2) },
    { title: "P kW", dataIndex: "p_kw", key: "p_kw", width: 78, render: (v: number) => v.toFixed(1) },
    { title: "負載Q", dataIndex: "load_q_kvar", key: "load_q_kvar", width: 74,
      render: (v?: number) => v ? v.toFixed(1) : <span style={{ color: "#ccc" }}>—</span> },
    { title: "電容Q", dataIndex: "shunt_q_kvar", key: "shunt_q_kvar", width: 74,
      render: (v?: number) => v ? <span style={{ color: "#13a8a8", fontWeight: 600 }}>{v.toFixed(1)}</span> : <span style={{ color: "#ccc" }}>—</span> },
    { title: <>淨Q <span style={{ color: "#bbb", fontWeight: 400, fontSize: 10 }}>kVAr</span></>, dataIndex: "q_kvar", key: "q_kvar", width: 92,
      render: (v: number) => <span style={{ color: v < 0 ? "#13a8a8" : (dark ? "#ddd" : "#333") }}>{v.toFixed(1)}</span> },
    { title: "PF", key: "pf", width: 74,
      sorter: (a, b) => (pfInfo(a.p_kw, a.q_kvar)?.v ?? 2) - (pfInfo(b.p_kw, b.q_kvar)?.v ?? 2),
      render: (_: unknown, r: BusFlow) => {
        const info = pfInfo(r.p_kw, r.q_kvar);
        if (!info) return <span style={{ color: "#ccc" }}>—</span>;
        return <span style={{ color: info.v < 0.9 ? "#fa8c16" : (dark ? "#ddd" : "#333") }}>
          {info.v.toFixed(3)}<span style={{ color: "#999", fontSize: 10, marginLeft: 2 }}>{info.lead ? "超" : "滯"}</span>
        </span>;
      } },
  ];
  const effDash = scenario ? {
    ...dash, total_load_kw: scenario.total_load_kw, total_load_kvar: scenario.total_load_kvar,
    system_loss_kw: scenario.system_loss_kw, system_loss_kvar: scenario.system_loss_kvar,
    grid_import_kw: scenario.grid_import_kw, grid_import_kvar: scenario.grid_import_kvar,
    min_voltage_pu: scenario.min_voltage_pu, max_transformer_load_ratio_percent: scenario.max_transformer_load_ratio_percent,
    max_feeder_load_ratio_percent: scenario.max_feeder_load_ratio_percent, status: scenario.status,
  } : dash;

  // V1 範圍聲明隨當前電網切換:已建模網(北)=規劃估算;開發中網(南)=初步建模、尚未校正
  const curNetName = networks.find((n) => n.id === currentNet)?.name ?? (currentNet === "south" ? "南電錶" : "北電錶");
  const coverageText = DEV_NETS.has(currentNet)
    ? `${curNetName}區建置中,數據為初步建模、尚未校正`
    : `部分數值為規劃估算、模型涵蓋${curNetName}區`;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}
      onClick={(e) => { if (focus && !(e.target as HTMLElement).closest("[data-focus-keep]")) setFocus(null); }}>
      {/* 點任何「非互動背景」清除焦點;互動區(地圖、右欄焦點詳情、日曲線)標 data-focus-keep 保留 */}
      {/* V1 範圍/可信度聲明(連驗證中心)+ 第一次使用提示(接在後面,看過/關閉後不再出現) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px", background: "#e6f4ff", border: "1px solid #91caff", borderRadius: 6, fontSize: 13, lineHeight: 1.5, color: "#0958d9", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, background: "#0958d9", color: "#fff", borderRadius: 3, padding: "0 6px", fontSize: 12 }}>V1</span>
        <span style={{ color: "#333" }}>{coverageText}。各數據來源與待校正項目請見</span>
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

      <div className="cmd-stagger" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "300px 1fr 360px", gap: 10 }}>
      {/* 左:狀態 + KPI 面板 */}
      <div style={{ height: "100%", overflow: "hidden" }}>
        <StatsPanel dash={effDash} pf={effPf} dark={dark} daySnapshots={daySnapshots} curveDate={dayDate} peakHour={dayPeakHour} selectedHour={selectedHour} onScrubHour={scrubHour} dayDev={DEV_NETS.has(currentNet)} />
      </div>

      {/* 中:地圖 / 單線圖 切換 */}
      <div data-focus-keep style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #eef1f5", borderRadius: 12, boxShadow: "0 1px 4px rgba(20,40,80,.05)", overflow: "hidden" }}>
        <div style={{ padding: "7px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f2f5", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{centerView === "map" ? "校園供電地圖" : centerView === "single" ? "高壓配電單線圖" : "母線潮流表"}{" "}
            {(networks.length ? networks : [{ id: currentNet, name: currentNet === "south" ? "南電錶" : "北電錶" }]).map((n) => {
              // 標籤高亮:只有「地圖」總覽(無焦點)時南北系統皆亮 —— 地圖本就同時顯示兩系統建物。
              // 鑽入某系統(有焦點)只亮作用中那個;單線圖/母線潮流是單一電網的頁面,也只亮作用中那個。
              const lit = centerView === "map" ? (!focus || n.id === currentNet) : n.id === currentNet;
              return (
              <Tag key={n.id} color={lit ? "geekblue" : "default"}
                style={{ cursor: "pointer", opacity: lit ? 1 : 0.7, fontWeight: 700 }}
                title={DEV_NETS.has(n.id) ? `${n.name}系統開發中,數據為初步建模、尚未校正` : (n.id === currentNet ? "點選聚焦受電站、高亮整個系統" : `切換到${n.name}系統(也可直接點該系統建物)`)}
                onClick={() => {
                  if (n.id !== currentNet) { setNetwork(n.id); setCurrentNet(n.id); setEditing(false); }   // 切換:更新 state 觸發重抓重繪,不刷頁
                  // 一鍵聚焦該系統受電站(免點兩次),且與該受電站建物綁定:
                  // 南 H1 本身是建物 → 聚焦 H1(卡片含建物+受電站、全系統亮+H1/H2 強調);北 X 純受電站 → 聚焦受電站。
                  const sl = SOURCE_LETTER_BY_NET[n.id];
                  const rep = repByLetterAll.get(sl);
                  if (rep) setFocus({ kind: "building", id: rep, label: `${sl}棟` });
                  else setFocus({ kind: "source", id: SOURCE_KEY, label: `受電站(${sl}棟)` });
                }}>
                {n.name}系統{DEV_NETS.has(n.id) && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, opacity: 0.85 }}>· 開發中</span>}
              </Tag>
              );
            })}
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
              <Segmented size="small" value={centerView} onChange={(v) => setCenterView(v as "map" | "single" | "bus")}
                options={[{ label: "地圖", value: "map" }, { label: "單線圖", value: "single" }, { label: "母線潮流", value: "bus" }]} />
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
            : centerView === "single"
              ? (graph
                  ? <SingleLineSvg graph={graph} pf={effPf} selectedId={focus?.id ?? null} onSelect={(n) => setFocus({ kind: n.kind as FocusKind, id: n.id, label: n.id })} />
                  : <Spin />)
              : (
                // 母線潮流表:牛頓-拉夫遜潮流各母線電壓大小/相角 + 注入功率 + Slack/PV/PQ 分類
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{ fontSize: 12, color: dark ? "#8aa" : "#999", padding: "0 2px 6px" }}>
                    牛頓-拉夫遜潮流 · {busFlows.length} 條母線 · Slack {slackCount}、PV 0、其餘 PQ。
                    Slack(swing)＝台電受電點,定電壓 1.0∠0°;此電網無發電機,故無 PV 母線。電壓越限(&lt;0.95 或 &gt;1.05 pu)標紅。
                    <span style={{ color: "#13a8a8" }}>「淨Q＝負載Q＋電容Q」,電容器供給無功記負值(青色)。</span>
                    {" "}PF＝該母線淨功因(滯=電感性、超=電容性;&lt;0.9 標橙)。
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                    <Table<BusFlow> rowKey="bus_name" size="small" columns={busColumns} dataSource={busFlows}
                      pagination={false} sticky scroll={{ x: 650 }} />
                  </div>
                </div>
              )}
        </div>
      </div>

      {/* 右:焦點面板 */}
      <Card data-focus-keep size="small" title={<span className="cmd-accentbar">焦點詳情</span>} style={{ height: "100%", overflow: "hidden", borderRadius: 12, border: "1px solid #eef1f5", boxShadow: "0 1px 4px rgba(20,40,80,.05)" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <FocusPanel buildings={buildings} trafos={trafos} dash={dash} />
      </Card>
      </div>
    </div>
  );
}
