// 用電強度 EUI:各棟 + 全校 kWh/m²·年,供節能績效/能源局申報。
// 後端 /api/eui:全校年用電量(XGBoost 整年預測)× 各棟負載占比 ÷ 樓地板面積。
import { Button, Card, InputNumber, Spin, Statistic, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { api } from "../api/client";
import type { EUIReport } from "../api/types";
import { downloadCSV, stamp } from "../lib/csv";

const euiColor = (eui: number, campus: number, benchmark: number) =>
  eui > benchmark ? "#ff4d4f" : eui > campus ? "#fa8c16" : "#52c41a";

export default function EnergyIntensity() {
  const [data, setData] = useState<EUIReport>();
  const [loading, setLoading] = useState(true);
  const [benchmark, setBenchmark] = useState<number>(120);   // 可編輯參考基準;載入時帶後端預設

  useEffect(() => {
    api.eui().then((d) => { setData(d); setBenchmark(d.benchmark); })
      .catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);

  // 節能優先:高於全校均,且面積足夠可靠(排除小面積分母放大假象)
  const priority = useMemo(
    () => (data ? data.buildings.filter((b) => b.eui > data.campus_eui && b.area_reliable) : []),
    [data],
  );
  const hasSmall = useMemo(() => (data ? data.buildings.some((b) => !b.area_reliable) : false), [data]);

  const chartOption = data && {
    grid: { left: 96, right: 56, top: 10, bottom: 28 },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: { name: string; value: number; dataIndex: number }[]) => {
        const b = data.buildings[ps[0].dataIndex];
        const warn = b.area_reliable ? "" : `<br/><span style="color:#fa8c16">⚠ 面積偏小,EUI 僅供參考</span>`;
        return `${b.name}（${b.letter}棟）<br/>EUI <b>${b.eui}</b> kWh/m²·年<br/>樓地板 ${b.floor_area_m2.toLocaleString()} m²<br/>年用電 ${Math.round(b.annual_kwh / 1000).toLocaleString()} MWh${warn}`;
      },
    },
    xAxis: { type: "value", name: "kWh/m²·年", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "category", inverse: true, axisLabel: { fontSize: 11 },
      data: data.buildings.map((b) => `${b.letter}·${b.name.slice(0, 5)}${b.area_reliable ? "" : "＊"}`),
    },
    series: [{
      type: "bar", barMaxWidth: 16,
      data: data.buildings.map((b) => ({
        value: b.eui,
        itemStyle: b.area_reliable
          ? { color: euiColor(b.eui, data.campus_eui, benchmark) }
          : { color: "#d9d9d9", decal: { symbol: "line", color: "rgba(0,0,0,0.18)", dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4 } },
      })),
      label: { show: true, position: "right", fontSize: 10, formatter: (p: { value: number }) => p.value },
      markLine: {
        symbol: "none", silent: true,
        data: [
          { xAxis: data.campus_eui, label: { formatter: `全校均 ${data.campus_eui}`, fontSize: 10, color: "#1677ff" }, lineStyle: { color: "#1677ff", type: "dashed" } },
          { xAxis: benchmark, label: { formatter: `參考 ${benchmark}`, fontSize: 10, color: "#999", position: "insideEndTop" }, lineStyle: { color: "#bbb", type: "dotted" } },
        ],
      },
    }],
  };

  const exportCsv = () => data && downloadCSV(`各棟用電強度EUI_${stamp()}.csv`, data.buildings, [
    { label: "EUI排名", value: (b) => data.buildings.indexOf(b) + 1 },
    { label: "建物代號", value: (b) => b.letter },
    { label: "建物", value: (b) => b.name },
    { label: "樓地板面積(m²)", value: (b) => b.floor_area_m2 },
    { label: "現況負載(kW)", value: (b) => b.load_kw },
    { label: "年用電量(kWh)", value: (b) => b.annual_kwh },
    { label: "EUI(kWh/m²·年)", value: (b) => b.eui },
  ]);

  if (loading || !data || !chartOption) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <div className="cmd-stagger" style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr", gap: 10 }}>
      {/* 左:全校摘要 + 節能優先棟 */}
      <Card size="small" title={<span className="cmd-accentbar">全校用電強度</span>} style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <Statistic value={data.campus_eui} suffix="kWh/m²·年" valueStyle={{ fontSize: 26, color: "#1677ff" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ color: "#888", fontSize: 12 }}>{data.year} 年 · 參考基準</span>
          <InputNumber size="small" style={{ width: 96 }} min={0} step={5} value={benchmark}
            onChange={(v) => setBenchmark(v ?? 0)} addonAfter="kWh/m²" />
        </div>
        <div style={{ color: "#bbb", fontSize: 11, marginTop: 3 }}>
          填學校歷史值或能源署大專基準(參考 80–130);驅動紅線與「超參考」標色
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 10 }}>
          <span>年用電量</span><b>{(data.campus_annual_kwh / 1e6).toFixed(2)} GWh</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 4 }}>
          <span>總樓地板面積</span><b>{Math.round(data.total_floor_area_m2).toLocaleString()} m²</b>
        </div>

        <div style={{ borderTop: "1px solid #f0f0f0", margin: "12px 0 8px" }} />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          節能改善優先棟 <Tag color="orange">{priority.length}</Tag>
          <span style={{ color: "#bbb", fontSize: 11, fontWeight: 400 }}>(高於全校均)</span>
        </div>
        {priority.slice(0, 8).map((b, i) => (
          <div key={b.letter} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
            <span><Tag color={euiColor(b.eui, data.campus_eui, benchmark)} style={{ marginInlineEnd: 4 }}>{i + 1}</Tag>{b.letter}·{b.name.slice(0, 6)}</span>
            <b style={{ color: euiColor(b.eui, data.campus_eui, benchmark) }}>{b.eui}</b>
          </div>
        ))}

        <Button size="small" block style={{ marginTop: 12 }} onClick={exportCsv}>匯出各棟 EUI (CSV)</Button>
        {hasSmall && (
          <div style={{ color: "#fa8c16", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            ＊面積 &lt; 2000 m²,EUI 易受分母放大失真,僅供參考、未列入優先棟。
          </div>
        )}
        <div style={{ color: "#bbb", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
          各棟年用電以現況負載占比近似;全校量為 XGBoost 整年預測,無氣溫特徵,夏季可能略偏低。
        </div>
      </Card>

      {/* 右:各棟 EUI 長條 */}
      <Card size="small" title={<span className="cmd-accentbar">各棟用電強度(高 → 低)</span>} style={{ height: "100%" }}
        styles={{ body: { padding: 8, height: "calc(100% - 39px)" } }}
        extra={<span style={{ fontSize: 11, color: "#999" }}><Tag color="#ff4d4f">超參考</Tag><Tag color="#fa8c16">高於全校均</Tag><Tag color="#52c41a">良好</Tag></span>}>
        <ReactECharts option={chartOption} style={{ height: "100%" }} notMerge />
      </Card>
    </div>
  );
}
