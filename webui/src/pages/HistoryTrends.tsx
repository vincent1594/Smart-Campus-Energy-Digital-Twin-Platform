// 歷史趨勢:EMS 北電錶實測逐時(2023/03–06)聚合 —— 每日尖峰/平均、典型日曲線、各饋線占比。
import { Card, Spin, Statistic, message } from "antd";
import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { api } from "../api/client";
import type { HistoryReport } from "../api/types";

const kw = (v: number) => `${Math.round(v).toLocaleString()} kW`;

export default function HistoryTrends() {
  const [d, setD] = useState<HistoryReport>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.history().then(setD).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);

  if (loading || !d) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  const dailyOption = {
    grid: { left: 52, right: 16, top: 28, bottom: 28 },
    legend: { right: 8, top: 0, itemWidth: 16, textStyle: { fontSize: 11 } },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => kw(v) },
    xAxis: { type: "category", data: d.daily.map((x) => x.date.slice(5)), axisLabel: { fontSize: 9, interval: 6 } },
    yAxis: { type: "value", name: "kW", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series: [
      { name: "每日尖峰", type: "line", smooth: true, symbol: "none", data: d.daily.map((x) => x.peak_kw), lineStyle: { color: "#ff4d4f", width: 1.5 }, itemStyle: { color: "#ff4d4f" } },
      { name: "每日平均", type: "line", smooth: true, symbol: "none", areaStyle: { color: "rgba(22,119,255,0.10)" }, data: d.daily.map((x) => x.avg_kw), lineStyle: { color: "#1677ff", width: 1.5 }, itemStyle: { color: "#1677ff" } },
    ],
  };

  const profileOption = {
    grid: { left: 52, right: 16, top: 28, bottom: 24 },
    legend: { right: 8, top: 0, itemWidth: 16, textStyle: { fontSize: 11 } },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => kw(v) },
    xAxis: { type: "category", data: d.profile.map((x) => `${x.hour}`), axisLabel: { fontSize: 10, interval: 1 }, name: "時", nameTextStyle: { fontSize: 10 } },
    yAxis: { type: "value", name: "kW", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series: [
      { name: "平日", type: "line", smooth: true, symbol: "none", data: d.profile.map((x) => x.weekday_kw), lineStyle: { color: "#fa8c16", width: 2 }, itemStyle: { color: "#fa8c16" } },
      { name: "假日", type: "line", smooth: true, symbol: "none", data: d.profile.map((x) => x.weekend_kw), lineStyle: { color: "#52c41a", width: 2 }, itemStyle: { color: "#52c41a" } },
    ],
  };

  const maxFeeder = d.feeders[0]?.avg_kw ?? 1;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr", gap: 10 }}>
      {/* 左:統計 + 各饋線 */}
      <Card size="small" title="實測負載概況" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <div style={{ color: "#888", fontSize: 12 }}>期間 {d.period_start} ~ {d.period_end}（{d.days} 天)</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Statistic title="尖峰需量" value={d.peak_kw} suffix="kW" valueStyle={{ fontSize: 19, color: "#ff4d4f" }} />
          <Statistic title="平均需量" value={d.avg_kw} suffix="kW" valueStyle={{ fontSize: 19, color: "#1677ff" }} />
        </div>
        <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>尖峰時刻 {d.peak_time.slice(0, 16)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 8 }}>
          <span>期間總用電</span><b>{(d.total_kwh / 1e6).toFixed(2)} GWh</b>
        </div>

        <div style={{ borderTop: "1px solid #f0f0f0", margin: "12px 0 8px" }} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>各饋線期間平均(降冪)</div>
        {d.feeders.map((f) => (
          <div key={f.feeder} style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "2px 6px", marginBottom: 2, borderRadius: 3, overflow: "hidden", background: "#fafafa" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(f.avg_kw / maxFeeder) * 100}%`, background: "rgba(22,119,255,0.13)" }} />
            <span style={{ position: "relative", color: "#555" }}>{f.name}</span>
            <span style={{ position: "relative", color: "#333" }}>{Math.round(f.avg_kw)} kW</span>
          </div>
        ))}

        <div style={{ color: "#bbb", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>{d.source}</div>
      </Card>

      {/* 右:兩張趨勢圖 */}
      <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <Card size="small" title="每日尖峰 / 平均需量" style={{ flex: 1, minHeight: 0 }} styles={{ body: { padding: 6, height: "calc(100% - 39px)" } }}>
          <ReactECharts option={dailyOption} style={{ height: "100%" }} notMerge />
        </Card>
        <Card size="small" title="典型日負載曲線(平日 / 假日)" style={{ flex: 1, minHeight: 0 }} styles={{ body: { padding: 6, height: "calc(100% - 39px)" } }}>
          <ReactECharts option={profileOption} style={{ height: "100%" }} notMerge />
        </Card>
      </div>
    </div>
  );
}
