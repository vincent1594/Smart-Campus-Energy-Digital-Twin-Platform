// 系統狀態 + KPI + 即時負載趨勢 + 告警統計 + 環境監測 的左欄面板。
// 主題自適應:dark = 戰情室發光版;light = 工作台白卡版。戰情室與工作台共用。
import { Tag } from "antd";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { DashboardSummary, PowerFlowResult } from "../api/types";

const TREND_X = Array.from({ length: 13 }, (_, i) => String(i * 2).padStart(2, "0"));
const TREND_Y = [1900, 1500, 1300, 1400, 2600, 3800, 4200, 4300, 4100, 3600, 2800, 2100, 1700];

export default function StatsPanel({ dash, pf, dark = false }: { dash: DashboardSummary; pf: PowerFlowResult; dark?: boolean }) {
  const C = dark
    ? { bg: "rgba(13,27,42,.55)", border: "#1b3a5b", text: "#cfe9ff", muted: "#5f86a8", accent: "#00e5ff" }
    : { bg: "#fff", border: "#f0f0f0", text: "#2a2a2a", muted: "#8c8c8c", accent: "#1677ff" };
  const panel: React.CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
    boxShadow: dark ? "0 0 14px rgba(0,229,255,.12), inset 0 0 24px rgba(0,229,255,.03)" : "0 1px 3px rgba(0,0,0,.06)",
    padding: 12,
  };
  const Demo = <Tag style={{ marginInlineStart: 4, color: C.muted, borderColor: C.border, background: "transparent", fontSize: 10 }}>示意</Tag>;
  const Kpi = ({ label, value, unit, accent, demo }: { label: React.ReactNode; value: string | number; unit?: string; accent: string; demo?: boolean }) => (
    <div style={{ ...panel, padding: 10, flex: 1 }}>
      <div style={{ color: C.muted, fontSize: 12 }}>{label}{demo && Demo}</div>
      <div style={{ color: accent, fontSize: 22, fontWeight: 700, textShadow: dark ? `0 0 10px ${accent}66` : "none", lineHeight: 1.3 }}>
        {value}<span style={{ fontSize: 12, color: C.text, marginInlineStart: 4 }}>{unit}</span>
      </div>
    </div>
  );

  const alerts = useMemo(() => {
    let warn = 0, note = 0;
    const add = (r: number) => (r > 100 ? warn++ : note++);
    pf.transformer_loadings.filter((t) => t.load_ratio_percent >= 80).forEach((t) => add(t.load_ratio_percent));
    pf.feeder_loadings.filter((f) => f.load_ratio_percent >= 80).forEach((f) => add(f.load_ratio_percent));
    pf.building_voltages.filter((b) => b.voltage_pu < 0.95).forEach(() => note++);
    return { warn, note };
  }, [pf]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <div style={{ ...panel, textAlign: "center" }}>
        <div style={{ color: C.muted, fontSize: 12 }}>系統狀態 SYSTEM STATUS</div>
        <div style={{ fontSize: 28, fontWeight: 800, textShadow: "0 0 14px currentColor",
          color: dash.status === "OK" ? "#52c41a" : dash.status === "WARNING" ? "#faad14" : "#ff4d4f" }}>{dash.status}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="總負載" value={dash.total_load_kw} unit="kW" accent={C.accent} />
        <Kpi label="系統損耗" value={dash.system_loss_kw} unit="kW" accent="#fa8c16" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="最低電壓" value={dash.min_voltage_pu} unit="pu" accent={dash.min_voltage_pu < 0.95 ? "#ff4d4f" : "#52c41a"} />
        <Kpi label="最大變壓器" value={dash.max_transformer_load_ratio_percent} unit="%" accent="#faad14" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Kpi label="今日用電量" value={"18,620"} unit="kWh" accent="#9254de" demo />
        <Kpi label="碳排減量" value={"328"} unit="kg" accent="#52c41a" demo />
      </div>
      <div style={{ ...panel, flex: 1, minHeight: 80, display: "flex", flexDirection: "column" }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>即時負載趨勢{Demo}</div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactECharts style={{ height: "100%", width: "100%" }} option={{
            grid: { left: 36, right: 8, top: 10, bottom: 18 }, tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: TREND_X, axisLabel: { color: C.muted, fontSize: 9 }, axisLine: { lineStyle: { color: C.border } } },
            yAxis: { type: "value", axisLabel: { color: C.muted, fontSize: 9 }, splitLine: { lineStyle: { color: dark ? "#12283f" : "#f0f0f0" } } },
            series: [{ type: "line", smooth: true, data: TREND_Y, showSymbol: false, lineStyle: { color: C.accent, width: 2 }, areaStyle: { color: dark ? "rgba(0,229,255,.18)" : "rgba(22,119,255,.12)" } }],
          }} />
        </div>
      </div>
      <div style={{ ...panel, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
        <div><div style={{ color: C.muted, fontSize: 12 }}>告警統計</div><div style={{ fontSize: 24, fontWeight: 700, color: alerts.warn ? "#ff4d4f" : "#52c41a" }}>{alerts.warn + alerts.note}</div></div>
        <div><div style={{ color: "#faad14", fontSize: 12 }}>警告</div><div style={{ fontSize: 20, color: C.text }}>{alerts.warn}</div></div>
        <div><div style={{ color: "#1677ff", fontSize: 12 }}>注意</div><div style={{ fontSize: 20, color: C.text }}>{alerts.note}</div></div>
      </div>
      <div style={panel}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>環境監測{Demo}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.text }}>
          <span>🌡 28°C</span><span>💧 62%</span><span>🌬 2.1m/s</span><span>PM2.5 18</span>
        </div>
      </div>
    </div>
  );
}
