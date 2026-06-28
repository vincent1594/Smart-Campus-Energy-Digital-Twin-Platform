// 系統狀態 + KPI + 日負載曲線 + 告警統計 + 環境監測 的左欄面板。
// 主題自適應:dark = 戰情室發光版;light = 工作台白卡版。
// 環境監測:Open-Meteo 免費即時資料(南臺科大座標),失敗回退示意值。
import { CloudOutlined, DashboardOutlined, DeploymentUnitOutlined, FireOutlined, PercentageOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardSummary, PowerFlowResult } from "../api/types";

// 示意日負載曲線(形狀),於基準時點縮放對齊真實總負載
const TREND_SHAPE = [1900, 1500, 1300, 1400, 2600, 3800, 4200, 4300, 4100, 3600, 2800, 2100, 1700];

// KPI 數字「從 0 跳數到真實值」—— 本次 session 只跳一次(進場時),之後值變動直接顯示。
// 進場動畫只在 mount 跑一次、追最新值,不被 value 變動(點/拖曳曲線)打斷。
let kpiCounted = false;
function CountUp({ value, decimals = 0, format }: { value: number; decimals?: number; format?: (n: number) => string }) {
  const [disp, setDisp] = useState(kpiCounted ? value : 0);
  const latest = useRef(value);
  latest.current = value;
  // 已跳過進場動畫 → value 變動直接顯示
  useEffect(() => { if (kpiCounted) setDisp(value); }, [value]);
  // 進場動畫:mount 只跑一次(空 deps),不會被 value 變動 cancel/重啟
  useEffect(() => {
    if (kpiCounted) return;
    let raf = 0, t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / 1000);
      setDisp(latest.current * (1 - Math.pow(1 - p, 3)));   // 追最新值,跑滿 1 秒
      if (p < 1) raf = requestAnimationFrame(step);
      else { setDisp(latest.current); kpiCounted = true; }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <>{format ? format(disp) : disp.toFixed(decimals)}</>;
}

// 南臺科技大學(台南永康)
const LAT = 22.9925, LON = 120.2255;

// 台灣電力排碳係數(經濟部能源署 2023 年公告)kg CO₂e/kWh
const CO2_EF = 0.494;

// PV 導向環境:即時氣溫、雲量、日照(GHI),並估算模組溫度
interface EnvData { temp?: number; cloud?: number; ghi?: number; live: boolean }

// 模組溫度估算(NOCT 法):T_module ≈ T_ambient + (NOCT-20)/800 × GHI,NOCT≈45°C
function moduleTemp(temp?: number, ghi?: number): number | undefined {
  if (temp == null || ghi == null) return undefined;
  return temp + ((45 - 20) / 800) * ghi;
}

function useEnv(): EnvData {
  const [env, setEnv] = useState<EnvData>({ live: false });
  useEffect(() => {
    let alive = true;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,cloud_cover,shortwave_radiation&timezone=auto`)
      .then((r) => r.json())
      .then((wd) => {
        if (!alive) return;
        const c = wd?.current ?? {};
        setEnv({ temp: c.temperature_2m, cloud: c.cloud_cover, ghi: c.shortwave_radiation, live: true });
      })
      .catch(() => { /* 保持未連線 */ });
    return () => { alive = false; };
  }, []);
  return env;
}

export default function StatsPanel({ dash, pf, dark = false, daySnapshots, curveDate, peakHour, selectedHour, onScrubHour, dayDev = false }: {
  dash: DashboardSummary; pf: PowerFlowResult; dark?: boolean;
  daySnapshots?: PowerFlowResult[];            // 歷史尖峰日 24h 實測快照(供拖曳基準點)
  curveDate?: string;                          // 曲線所屬日期(歷史尖峰最高日)
  peakHour?: number | null;                    // 該日尖峰小時(marker 預設位置)
  selectedHour?: number | null;
  onScrubHour?: (hour: number) => void;
  dayDev?: boolean;                            // 此電網日負載曲線(尖峰預測)尚在開發中 → 標「開發中」而非永久「載入中」
}) {
  const C = dark
    ? { bg: "rgba(13,27,42,.55)", border: "#1b3a5b", text: "#cfe9ff", muted: "#5f86a8", accent: "#00e5ff" }
    : { bg: "#fff", border: "#eef1f5", text: "#2a2a2a", muted: "#8c8c8c", accent: "#1677ff" };
  const panel: React.CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
    boxShadow: dark ? "0 0 14px rgba(0,229,255,.12), inset 0 0 24px rgba(0,229,255,.03)" : "0 1px 4px rgba(20,40,80,.05)",
    padding: 12,
  };
  const Demo = <Tag style={{ marginInlineStart: 4, color: C.muted, borderColor: C.border, background: "transparent", fontSize: 10 }}>示意</Tag>;
  const env = useEnv();

  const Kpi = ({ label, value, unit, accent, demo, extra, icon }: { label: React.ReactNode; value: React.ReactNode; unit?: string; accent: string; demo?: boolean; extra?: string; icon?: React.ReactNode }) => (
    <div style={{ ...panel, padding: "8px 10px 8px 12px", flex: 1, borderLeft: `3px solid ${accent}`, position: "relative", overflow: "hidden" }}>
      {icon && <span style={{ position: "absolute", top: 8, right: 10, color: accent, opacity: dark ? 0.5 : 0.26, fontSize: 16 }}>{icon}</span>}
      <div style={{ color: C.muted, fontSize: 12 }}>{label}{demo && Demo}</div>
      <div style={{ color: accent, fontSize: 20, fontWeight: 700, textShadow: dark ? `0 0 10px ${accent}66` : "none", lineHeight: 1.3, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {value}<span style={{ fontSize: 11, color: C.text, marginInlineStart: 3 }}>{unit}</span>
        {extra && <span style={{ fontSize: 10, color: C.muted, marginInlineStart: 4 }}>/ {extra}</span>}
      </div>
    </div>
  );

  // 日負載曲線:有 daySnapshots(當日 24h 錨定快照)→ 真實逐時、可拖曳基準點;否則退回示意形狀。
  const basisHour = Math.min(23, Math.max(0, Number(dash.load_basis?.match(/(\d{1,2}):\d{2}/)?.[1] ?? 14)));
  const dayDate = curveDate ?? dash.load_basis?.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)?.[0]?.replace(/\//g, "-");   // 日曲線所屬日期
  const { trendX, trendY, markIdx, real } = useMemo(() => {
    if (daySnapshots && daySnapshots.length === 24) {
      return {
        trendX: daySnapshots.map((_, h) => String(h).padStart(2, "0")),
        trendY: daySnapshots.map((s) => Math.round(s.total_load_kw)),
        markIdx: selectedHour ?? peakHour ?? basisHour, real: true,
      };
    }
    const idx = Math.min(TREND_SHAPE.length - 1, Math.round(basisHour / 2));
    const scale = (pf.total_load_kw || TREND_SHAPE[idx]) / (TREND_SHAPE[idx] || 1);
    return { trendX: TREND_SHAPE.map((_, i) => String(i * 2).padStart(2, "0")), trendY: TREND_SHAPE.map((v) => Math.round(v * scale)), markIdx: idx, real: false };
  }, [daySnapshots, selectedHour, peakHour, basisHour, pf.total_load_kw]);

  // 連續拖曳基準點:改在「容器 div」上用 DOM 滑鼠事件處理,完全不碰 echarts 實例。
  // 之前綁 zrender 會踩 echarts-for-react v3 的雷:開場動畫('finished')播完後它會 dispose 暫時實例、
  // 重建最終實例(換掉 zrender),綁在舊 zr 上的 listener 全失效 → 「動畫跑完拖不動」。
  // div 自身生命週期穩定;座標用 getBoundingClientRect + clientX 換算(grid 左右 = 36/10,
  // x 軸 boundaryGap:false → 邊到邊線性),clientX 必有值,不會像 zrX/offsetX 偶爾 undefined。
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastHour = useRef<number | null>(null);
  const scrubRef = useRef(onScrubHour);
  scrubRef.current = onScrubHour;
  const fireFromClientX = (clientX: number) => {
    const el = chartBoxRef.current, cb = scrubRef.current;
    if (!el || !cb) return;
    const rect = el.getBoundingClientRect();
    const plot = rect.width - 36 - 10;
    if (plot <= 0) return;
    const h = Math.max(0, Math.min(23, ((clientX - rect.left - 36) / plot) * 23));
    if (lastHour.current == null || Math.abs(h - lastHour.current) >= 0.04) { lastHour.current = h; cb(h); }
  };
  const onChartMouseDown = (e: React.MouseEvent) => {
    if (!real || !scrubRef.current) return;
    dragging.current = true; lastHour.current = null;
    fireFromClientX(e.clientX);
    const move = (ev: MouseEvent) => { if (dragging.current) fireFromClientX(ev.clientX); };
    const up = () => { dragging.current = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // 基準 pin 位置與標籤:markIdx 可為小數 → 線性內插出 y 值,標籤顯示 HH:MM
  const mFloor = Math.floor(markIdx);
  const markVal = trendY.length ? trendY[mFloor] + ((trendY[Math.min(trendY.length - 1, mFloor + 1)] ?? trendY[mFloor]) - trendY[mFloor]) * (markIdx - mFloor) : 0;
  const pinLabel = real
    ? (selectedHour != null
        ? `${String(Math.round(selectedHour)).padStart(2, "0")}:00`
        : (peakHour != null ? `尖峰 ${String(peakHour).padStart(2, "0")}:00` : "基準"))
    : "基準";

  // ECharts option 固定 identity:只在曲線資料/marker/主題變動時重算,
  // 不被 KPI 進場動畫每幀重渲染 churn(否則 setOption 連發會打斷曲線進場動畫)。
  const chartOption = useMemo(() => ({
    animationDuration: 900,
    grid: { left: 36, right: 10, top: 14, bottom: 18 },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v} kW` },
    xAxis: { type: "category", data: trendX, boundaryGap: false, axisLabel: { color: C.muted, fontSize: 9 }, axisLine: { lineStyle: { color: C.border } } },
    yAxis: { type: "value", axisLabel: { color: C.muted, fontSize: 9 }, splitLine: { lineStyle: { color: dark ? "#12283f" : "#f0f0f0" } } },
    series: [{
      type: "line", smooth: true, data: trendY, showSymbol: false, cursor: "ew-resize",
      lineStyle: { color: C.accent, width: 2 }, areaStyle: { color: dark ? "rgba(0,229,255,.18)" : "rgba(22,119,255,.12)" },
      markPoint: { symbol: "pin", symbolSize: 30, data: [{ coord: [markIdx, markVal], value: Math.round(markVal) }], label: { show: true, fontSize: 9, color: "#fff", formatter: "基準" }, itemStyle: { color: C.accent } },
    }],
  }), [trendX, trendY, markIdx, markVal, dark, C.muted, C.border, C.accent]);

  // 負載率最高的變壓器(顯示在「最大變壓器」KPI 後)
  const maxTr = useMemo(() => pf.transformer_loadings.reduce<typeof pf.transformer_loadings[number] | null>(
    (a, b) => (a == null || b.load_ratio_percent > a.load_ratio_percent ? b : a), null), [pf]);

  const alerts = useMemo(() => {
    let warn = 0, note = 0;
    const add = (r: number) => (r > 100 ? warn++ : note++);
    pf.transformer_loadings.filter((t) => t.load_ratio_percent >= 80).forEach((t) => add(t.load_ratio_percent));
    pf.feeder_loadings.filter((f) => f.load_ratio_percent >= 80).forEach((f) => add(f.load_ratio_percent));
    pf.building_voltages.filter((b) => b.voltage_pu < 0.95).forEach(() => note++);
    return { warn, note };
  }, [pf]);

  const statusColor = dash.status === "OK" ? "#52c41a" : dash.status === "WARNING" ? "#faad14" : "#ff4d4f";
  const statusDesc = dash.status === "OK" ? "正常運轉" : dash.status === "WARNING" ? "需注意" : "異常";

  // 系統總功因:取「進線端」P/√(P²+Q²)(台電計費點,含電容器補償);台電 ≥0.8 不罰、≥0.95 有折扣
  const gP = Math.abs(dash.grid_import_kw);
  const gQ = Math.abs(dash.grid_import_kvar);
  const sysPf = gP > 0 ? gP / Math.sqrt(gP ** 2 + gQ ** 2) : 0;
  const pfColor = sysPf >= 0.95 ? "#52c41a" : sysPf >= 0.8 ? "#faad14" : "#ff4d4f";

  // 環境監測單格
  const Env = ({ icon, value, label }: { icon: string; value: React.ReactNode; label: string }) => (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 15 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
    </div>
  );
  const n1 = (v?: number, f = 0) => (v == null ? null : v.toFixed(f));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <style>{"@keyframes bgPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}}"}</style>
      {/* 系統狀態英雄條:脈動點 + 漸層底 + 一句描述 */}
      <div style={{ ...panel, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px",
        background: dark ? C.bg : `linear-gradient(90deg, ${statusColor}1f, ${statusColor}08)`, borderColor: dark ? C.border : `${statusColor}55` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, animation: "bgPulse 1.8s ease-in-out infinite", boxShadow: `0 0 8px ${statusColor}` }} />
          <span style={{ color: C.muted, fontSize: 12, letterSpacing: 0.5 }}>系統狀態</span>
          <span style={{ fontSize: 21, fontWeight: 800, textShadow: dark ? `0 0 14px ${statusColor}99` : "none", color: statusColor, lineHeight: 1 }}>{dash.status}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{statusDesc}</span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="總負載" value={<CountUp value={dash.total_load_kw} decimals={0} />} unit="kW" accent={C.accent} extra={`${Math.round(dash.total_load_kvar)} kVAR`} icon={<ThunderboltOutlined />} />
        <Kpi label="系統損耗" value={<CountUp value={dash.system_loss_kw} decimals={1} />} unit="kW" accent="#fa8c16" extra={`${Math.round(dash.system_loss_kvar)} kVAR`} icon={<FireOutlined />} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="最低電壓" value={<CountUp value={dash.min_voltage_pu} decimals={4} />} unit="pu" accent={dash.min_voltage_pu < 0.95 ? "#ff4d4f" : "#52c41a"} extra={pf.min_voltage_building_name?.match(/\(([^)]+)\)/)?.[1] ?? pf.min_voltage_building_name ?? undefined} icon={<DashboardOutlined />} />
        <Kpi label="最大變壓器" value={<CountUp value={dash.max_transformer_load_ratio_percent} decimals={1} />} unit="%" accent="#faad14" extra={maxTr?.transformer_name} icon={<DeploymentUnitOutlined />} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="系統總功因" value={<CountUp value={sysPf} decimals={2} />} accent={pfColor} icon={<PercentageOutlined />} />
        <Kpi label="目前碳排放" value={<CountUp value={(dash.grid_import_kw || 0) * CO2_EF} format={(n) => Math.round(n).toLocaleString()} />} unit="kg/h" accent="#9e7d4e" icon={<CloudOutlined />} />
      </div>

      {/* 日負載曲線 */}
      <div style={{ ...panel, flex: 1, minHeight: 90, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ color: C.muted, fontSize: 12 }}>日負載曲線
            {dayDev && !real && <Tag color="orange" style={{ marginInlineStart: 4, fontSize: 10, fontWeight: 700 }}>開發中</Tag>}
            {dayDate && !(dayDev && !real) && <span style={{ marginInlineStart: 4, opacity: 0.85 }}>· {dayDate}</span>}
          </div>
          {real
            ? <div style={{ color: C.accent, fontSize: 10 }}>{pinLabel} · {Math.round(markVal)} kW · 拖曳切換</div>
            : dayDev
              ? null
              : onScrubHour
                ? <div style={{ color: C.muted, fontSize: 10, opacity: 0.9 }}>時段資料載入中…(約 10 秒,載好可拖曳)</div>
                : dash.load_basis && <div style={{ color: C.muted, fontSize: 10, opacity: 0.9 }}>基準:{dash.load_basis}</div>}
        </div>
        <div ref={chartBoxRef} data-focus-keep onMouseDown={onChartMouseDown} style={{ flex: 1, minHeight: 0, cursor: real ? "ew-resize" : "default" }}>
          {real
            ? <ReactECharts theme="bg" style={{ height: "100%", width: "100%" }} option={chartOption} />
            : dayDev
              ? <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11, textAlign: "center", lineHeight: 1.6 }}>此電網日負載曲線<br /><b>開發中</b></div>
              : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11 }}>載入中…</div>}
        </div>
      </div>

      {/* 告警統計 */}
      <div style={{ ...panel, display: "flex", justifyContent: "space-around", textAlign: "center", padding: "10px 12px" }}>
        <div><div style={{ color: C.muted, fontSize: 12 }}>告警統計</div><div style={{ fontSize: 24, fontWeight: 700, color: alerts.warn ? "#ff4d4f" : "#52c41a" }}>{alerts.warn + alerts.note}</div></div>
        <div style={{ borderLeft: `1px solid ${C.border}` }} />
        <div><div style={{ color: "#faad14", fontSize: 12 }}>⚠ 警告</div><div style={{ fontSize: 20, color: C.text }}>{alerts.warn}</div></div>
        <div><div style={{ color: "#1677ff", fontSize: 12 }}>● 注意</div><div style={{ fontSize: 20, color: C.text }}>{alerts.note}</div></div>
      </div>

      {/* 環境監測:PV 導向(Open-Meteo 即時日照/氣溫/雲量 + 估算模組溫度) */}
      <div style={{ ...panel, padding: "10px 12px" }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>環境監測
          {env.live
            ? <Tag color="green" style={{ marginInlineStart: 4, fontSize: 10 }}>即時</Tag>
            : <Tag style={{ marginInlineStart: 4, fontSize: 10, color: C.muted, borderColor: C.border, background: "transparent" }}>連線中</Tag>}
          <span style={{ color: C.muted, fontSize: 10, marginInlineStart: 2 }}>· Open-Meteo</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Env icon="☀️" value={`${n1(env.ghi) ?? "—"} W/m²`} label="日照" />
          <Env icon="🌡" value={`${n1(env.temp, 1) ?? "—"}°C`} label="氣溫" />
          <Env icon="☁️" value={`${n1(env.cloud) ?? "—"}%`} label="雲量" />
          <Env icon="🔆" value={`${n1(moduleTemp(env.temp, env.ghi), 1) ?? "—"}°C`} label="模組溫度" />
        </div>
      </div>
    </div>
  );
}
