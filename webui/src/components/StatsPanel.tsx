// 系統狀態 + KPI + 日負載曲線 + 告警統計 + 環境監測 的左欄面板。
// 主題自適應:dark = 戰情室發光版;light = 工作台白卡版。
// 環境監測:Open-Meteo 免費即時資料(南臺科大座標),失敗回退示意值。
import { Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import type { DashboardSummary, PowerFlowResult } from "../api/types";

// 示意日負載曲線(形狀),於基準時點縮放對齊真實總負載
const TREND_SHAPE = [1900, 1500, 1300, 1400, 2600, 3800, 4200, 4300, 4100, 3600, 2800, 2100, 1700];

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

export default function StatsPanel({ dash, pf, dark = false }: { dash: DashboardSummary; pf: PowerFlowResult; dark?: boolean }) {
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

  const Kpi = ({ label, value, unit, accent, demo, extra }: { label: React.ReactNode; value: string | number; unit?: string; accent: string; demo?: boolean; extra?: string }) => (
    <div style={{ ...panel, padding: "9px 10px 9px 12px", flex: 1, borderLeft: `3px solid ${accent}` }}>
      <div style={{ color: C.muted, fontSize: 12 }}>{label}{demo && Demo}</div>
      <div style={{ color: accent, fontSize: 20, fontWeight: 700, textShadow: dark ? `0 0 10px ${accent}66` : "none", lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {value}<span style={{ fontSize: 11, color: C.text, marginInlineStart: 3 }}>{unit}</span>
        {extra && <span style={{ fontSize: 10, color: C.muted, marginInlineStart: 4 }}>/ {extra}</span>}
      </div>
    </div>
  );

  // 日負載曲線:示意日曲線,於基準時點(由 load_basis 解析,如 14:00)標出基準情境的總負載
  const { trendX, trendY, basisIdx } = useMemo(() => {
    const x = TREND_SHAPE.map((_, i) => String(i * 2).padStart(2, "0"));
    const hourM = dash.load_basis?.match(/(\d{1,2}):\d{2}/);
    const hour = hourM ? Math.min(24, Math.max(0, Number(hourM[1]))) : 14;
    const idx = Math.min(TREND_SHAPE.length - 1, Math.round(hour / 2));
    const cur = pf.total_load_kw || TREND_SHAPE[idx];
    const scale = cur / (TREND_SHAPE[idx] || 1);
    return { trendX: x, trendY: TREND_SHAPE.map((v) => Math.round(v * scale)), basisIdx: idx };
  }, [pf.total_load_kw, dash.load_basis]);

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

  // 系統總功因 = P / √(P²+Q²);台電 ≥0.8 才不罰款
  const sysPf = dash.total_load_kw > 0
    ? dash.total_load_kw / Math.sqrt(dash.total_load_kw ** 2 + dash.total_load_kvar ** 2)
    : 0;
  const pfColor = sysPf >= 0.9 ? "#52c41a" : sysPf >= 0.8 ? "#faad14" : "#ff4d4f";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {/* 系統狀態 */}
      <div style={{ ...panel, textAlign: "center", padding: "10px 12px", background: dark ? C.bg : `${statusColor}0d`, borderColor: dark ? C.border : `${statusColor}40` }}>
        <div style={{ color: C.muted, fontSize: 12, letterSpacing: 0.5 }}>系統狀態 SYSTEM STATUS</div>
        <div style={{ fontSize: 30, fontWeight: 800, textShadow: `0 0 14px ${statusColor}99`, color: statusColor, lineHeight: 1.25 }}>{dash.status}</div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="總負載" value={dash.total_load_kw} unit="kW" accent={C.accent} extra={`${dash.total_load_kvar} kVAR`} />
        <Kpi label="系統損耗" value={dash.system_loss_kw} unit="kW" accent="#fa8c16" extra={`${dash.system_loss_kvar} kVAR`} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="最低電壓" value={dash.min_voltage_pu} unit="pu" accent={dash.min_voltage_pu < 0.95 ? "#ff4d4f" : "#52c41a"} />
        <Kpi label="最大變壓器" value={dash.max_transformer_load_ratio_percent} unit="%" accent="#faad14" extra={maxTr?.transformer_name} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="系統總功因" value={sysPf.toFixed(2)} accent={pfColor} />
        <Kpi label="目前碳排放" value={Math.round((dash.grid_import_kw || 0) * CO2_EF).toLocaleString()} unit="kg/h" accent="#9e7d4e" />
      </div>

      {/* 日負載曲線 */}
      <div style={{ ...panel, flex: 1, minHeight: 90, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 4 }}>
          <div style={{ color: C.muted, fontSize: 12 }}>日負載曲線</div>
          {dash.load_basis && <div style={{ color: C.muted, fontSize: 10, opacity: 0.9 }}>基準:{dash.load_basis}</div>}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactECharts style={{ height: "100%", width: "100%" }} option={{
            grid: { left: 36, right: 10, top: 14, bottom: 18 }, tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v} kW` },
            xAxis: { type: "category", data: trendX, axisLabel: { color: C.muted, fontSize: 9 }, axisLine: { lineStyle: { color: C.border } } },
            yAxis: { type: "value", axisLabel: { color: C.muted, fontSize: 9 }, splitLine: { lineStyle: { color: dark ? "#12283f" : "#f0f0f0" } } },
            series: [{ type: "line", smooth: true, data: trendY, showSymbol: false, lineStyle: { color: C.accent, width: 2 }, areaStyle: { color: dark ? "rgba(0,229,255,.18)" : "rgba(22,119,255,.12)" },
              markPoint: { symbol: "pin", symbolSize: 30, data: [{ coord: [basisIdx, trendY[basisIdx]], value: trendY[basisIdx] }], label: { show: true, fontSize: 9, color: "#fff", formatter: "基準" }, itemStyle: { color: C.accent } } }],
          }} />
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
