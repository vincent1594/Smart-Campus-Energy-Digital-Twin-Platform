// 需量契約:兩個視圖切換 ——
//   ① 需量預警:現況需量 vs 契約 + XGBoost 逐時尖峰 → 超約罰款 + 卸載建議
//   ② 時間電價電費:台電高壓三段式月電費試算(各時段度數×費率 + 基本電費 + 超約)
import { Alert, Button, Card, DatePicker, Divider, InputNumber, Progress, Segmented, Slider, Spin, Statistic, Tag, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { api } from "../api/client";
import type { ContractOptimization, DemandForecast, DemandStatus, MonthlyBill, TariffRates } from "../api/types";
import EnergyIntensity from "./EnergyIntensity";

const STATUS_COLOR: Record<string, string> = { OK: "#52c41a", WARNING: "#fa8c16", EXCEED: "#ff4d4f" };
const STATUS_TEXT: Record<string, string> = { OK: "正常", WARNING: "接近契約", EXCEED: "超約" };
const ntd = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;
const statusColor = (s: string) => STATUS_COLOR[s] ?? "#888";

// 模型資料涵蓋期 (EMS 2023/05–06)。逐時預測用「近期實際負載」特徵,
// 僅此區間有實測可參考 → 預設與可選日期皆限定此區間,逐週才會真正不同。
const DATA_MIN = dayjs("2023-05-08");   // 起首一週無上週 lag,故自 5/8 起
const DATA_MAX = dayjs("2023-06-30");
const DATA_DEFAULT = dayjs("2023-06-08");

export default function DemandManagement() {
  const [view, setView] = useState<string>("demand");
  const [contract, setContract] = useState<number>(3250);

  // 共用:首次取後端預設契約容量
  useEffect(() => {
    api.demand().then((s) => setContract(s.contract_capacity_kw)).catch(() => undefined);
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      <Segmented size="small" value={view} onChange={(v) => setView(String(v))}
        options={[{ label: "需量預警", value: "demand" }, { label: "契約最佳化", value: "optimize" }, { label: "時間電價電費", value: "bill" }, { label: "用電強度", value: "eui" }]} />
      <div style={{ flex: 1, minHeight: 0 }}>
        {view === "demand" ? <DemandView contract={contract} setContract={setContract} />
          : view === "optimize" ? <OptimizeView contract={contract} setContract={setContract} />
            : view === "bill" ? <BillView contract={contract} setContract={setContract} />
              : <EnergyIntensity />}
      </div>
    </div>
  );
}

// ============================================================================
// 視圖 ① 需量預警
// ============================================================================
function DemandView({ contract, setContract }: { contract: number; setContract: (n: number) => void }) {
  const [rate, setRate] = useState<number>(223.6);
  const [date, setDate] = useState<Dayjs>(DATA_DEFAULT);
  const [status, setStatus] = useState<DemandStatus>();
  const [fc, setFc] = useState<DemandForecast>();
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.demand().then((s) => setRate(s.demand_charge_nt_per_kw)).catch(() => undefined); }, []);

  useEffect(() => {
    const ds = date.format("YYYY-MM-DD");
    const t = setTimeout(() => {
      setLoading(true);
      Promise.all([api.demand(contract, rate), api.demandForecast(ds, contract, rate)])
        .then(([s, f]) => { setStatus(s); setFc(f); })
        .catch((e) => message.error(String(e.message ?? e)))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [contract, rate, date]);

  const hasActual = !!fc && fc.hourly.some((h) => h.actual_kw != null);
  const chartOption = fc && {
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    legend: { show: hasActual, top: 0, right: 8, itemWidth: 16, itemHeight: 8, textStyle: { fontSize: 10 } },
    tooltip: { trigger: "axis", valueFormatter: (v: number) => (v == null ? "—" : `${Math.round(v).toLocaleString()} kW`) },
    xAxis: { type: "category", data: fc.hourly.map((h) => `${h.hour}:00`), axisLabel: { fontSize: 10, interval: 1 } },
    yAxis: {
      type: "value", name: "kW", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 },
      // 確保契約線恆在視野內:尖峰低於契約的日子也要看得到紅虛線
      max: (v: { max: number }) => Math.ceil((Math.max(v.max, contract) * 1.08) / 100) * 100,
    },
    series: [
      {
        name: "預測", type: "line", smooth: true, symbol: "circle", symbolSize: 4,
        data: fc.hourly.map((h) => h.demand_kw),
        lineStyle: { color: "#1677ff", width: 2 }, itemStyle: { color: "#1677ff" },
        areaStyle: { color: "rgba(22,119,255,0.10)" },
        markLine: {
          symbol: "none", silent: true,
          data: [{ yAxis: contract, label: { formatter: `契約 ${contract.toLocaleString()} kW`, position: "insideEndTop", fontSize: 11, color: "#cf1322" }, lineStyle: { color: "#cf1322", type: "dashed", width: 1.5 } }],
        },
        markPoint: {
          symbolSize: 46,
          data: [{ type: "max", name: "尖峰", label: { fontSize: 10, formatter: (p: { value: number }) => `${Math.round(p.value).toLocaleString()}` }, itemStyle: { color: fc.status === "EXCEED" ? "#ff4d4f" : "#fa8c16" } }],
        },
      },
      ...(hasActual ? [{
        name: "實際(EMS)", type: "line", smooth: true, symbol: "none",
        data: fc.hourly.map((h) => h.actual_kw ?? null),
        lineStyle: { color: "#8c8c8c", width: 2, type: "dashed" }, itemStyle: { color: "#8c8c8c" },
      }] : []),
    ],
  };

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "290px 1fr 310px", gap: 8 }}>
      <Card size="small" title="契約 / 現況需量" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>契約容量(經常)</div>
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={1} step={50} value={contract} onChange={(v) => setContract(v ?? 0)} />
        <div style={{ color: "#888", fontSize: 12, margin: "8px 0 2px" }}>基本電費單價</div>
        <InputNumber size="small" style={{ width: "100%" }} addonAfter="元/kW" min={0} step={0.1} value={rate} onChange={(v) => setRate(v ?? 0)} />
        <div style={{ color: "#bbb", fontSize: 11, marginTop: 4 }}>依台電合約填寫,即時試算超約罰款</div>
        <Button size="small" block style={{ marginTop: 8 }}
          onClick={() => api.putSettings({ "demand.contract_kw": contract, "demand.rate": rate }, "admin")
            .then(() => message.success("已存為全站預設"))
            .catch((e) => message.error(String(e.message ?? e)))}>
          存為預設(全站套用)
        </Button>

        <Divider style={{ margin: "10px 0 8px" }} orientation="left" plain>現況需量</Divider>
        {status ? (
          <>
            <Statistic value={status.current_demand_kw} suffix="kW" valueStyle={{ fontSize: 23, color: statusColor(status.status) }} />
            <Progress percent={Math.min(100, status.utilization_percent)} size="small"
              strokeColor={statusColor(status.status)} format={() => `${status.utilization_percent}%`} style={{ marginTop: 4 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 6 }}>
              <span>契約 {status.contract_capacity_kw.toLocaleString()} kW</span>
              <span style={{ color: status.headroom_kw < 0 ? "#cf1322" : "#3f8600" }}>
                {status.headroom_kw < 0 ? `超約 ${Math.abs(status.headroom_kw).toLocaleString()}` : `餘裕 ${status.headroom_kw.toLocaleString()}`} kW
              </span>
            </div>
            <Tag color={statusColor(status.status)} style={{ marginTop: 10 }}>{STATUS_TEXT[status.status] ?? status.status}</Tag>
            <div style={{ color: "#bbb", fontSize: 11, marginTop: 8 }}>{status.load_basis}</div>
          </>
        ) : <Spin />}
      </Card>

      <Card size="small" style={{ height: "100%" }}
        styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}
        title={<span>逐時需量預測(XGBoost)</span>}
        extra={<DatePicker size="small" value={date} format="YYYY-MM-DD" allowClear={false}
          disabledDate={(cur) => cur && (cur.isBefore(DATA_MIN, "day") || cur.isAfter(DATA_MAX, "day"))}
          onChange={(d) => d && setDate(d)} />}>
        {loading || !chartOption ? <Spin size="large" style={{ margin: "auto" }} /> : (
          <>
            <ReactECharts option={chartOption} style={{ flex: 1, minHeight: 0 }} notMerge />
            <div style={{ color: "#999", fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
              各饋線預測需量加總(≈台電進線);紅虛線=契約容量。特徵:時間+學期行事曆+近期實際負載(逐週不同)。資料期 2023/05–06。
              {fc?.mae_kw != null && (
                <span style={{ color: "#555" }}>　當日預測vs實際 MAE {fc.mae_kw.toLocaleString()} kW · MAPE {fc.mape_pct}%
                  {fc.actual_peak_kw != null && ` · 實際尖峰 ${fc.actual_peak_kw.toLocaleString()} kW`}</span>
              )}
            </div>
          </>
        )}
      </Card>

      <Card size="small" title="超約評估 / 卸載建議" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        {!fc ? <Spin /> : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <Statistic title="預測尖峰" value={fc.peak_kw} suffix="kW" valueStyle={{ fontSize: 18 }} />
              <Statistic title="尖峰時段" value={`${fc.peak_hour}:00`} valueStyle={{ fontSize: 18 }} />
            </div>
            {fc.overshoot_kw > 0 ? (
              <Alert style={{ marginTop: 8 }} type="error" showIcon
                message={`預計超約 ${fc.overshoot_kw.toLocaleString()} kW`}
                description={<span>估罰 <b style={{ color: "#cf1322" }}>{ntd(fc.penalty_nt)}</b>/月(2/3 倍級距)</span>} />
            ) : (
              <Alert style={{ marginTop: 8 }} type="success" showIcon message="預測尖峰未超約" />
            )}

            {fc.shed_suggestions.length > 0 && (
              <>
                <Divider style={{ margin: "10px 0 6px" }} orientation="left" plain>卸載建議(回契約內)</Divider>
                <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>
                  尖峰 {fc.peak_hour}:00 起優先調控,累計約 {fc.shed_suggestions[fc.shed_suggestions.length - 1]?.cumulative_kw.toLocaleString()} kW:
                </div>
                {fc.shed_suggestions.map((s, i) => (
                  <div key={s.feeder_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "2px 0" }}>
                    <span><Tag color="red" style={{ marginInlineEnd: 4 }}>{i + 1}</Tag>{s.feeder_name}</span>
                    <span style={{ color: "#cf1322" }}>~{s.shed_kw.toLocaleString()} kW</span>
                  </div>
                ))}
              </>
            )}

            <Divider style={{ margin: "10px 0 6px" }} orientation="left" plain>尖峰各饋線需量</Divider>
            {fc.peak_feeders.map((f) => {
              const pct = fc.peak_feeders[0].demand_kw > 0 ? (f.demand_kw / fc.peak_feeders[0].demand_kw) * 100 : 0;
              return (
                <div key={f.feeder_id} style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "2px 6px", marginBottom: 2, borderRadius: 3, overflow: "hidden", background: "#fafafa" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "rgba(22,119,255,0.13)" }} />
                  <span style={{ position: "relative", color: "#555" }}>{f.feeder_name}</span>
                  <span style={{ position: "relative", color: "#333" }}>{f.demand_kw.toLocaleString()} kW</span>
                </div>
              );
            })}
          </>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// 視圖 ② 契約最佳化 —— 掃契約求「基本電費 + 全年超約罰款」最小;削峰可省為頭條
// ============================================================================
const wan = (n: number) => `${(n / 1e4).toLocaleString(undefined, { maximumFractionDigits: 1 })} 萬`;

function OptimizeView({ contract, setContract }: { contract: number; setContract: (n: number) => void }) {
  const [rate, setRate] = useState<number>(223.6);
  const [highMonths, setHighMonths] = useState<number>(4);
  const [offseason, setOffseason] = useState<number>(0.7);
  const [data, setData] = useState<ContractOptimization>();
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.demand().then((s) => setRate(s.demand_charge_nt_per_kw)).catch(() => undefined); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api.contractOptimize(contract, rate, highMonths, offseason)
        .then(setData).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [contract, rate, highMonths, offseason]);

  const overPct = data ? Math.round((data.summer_peak_kw / data.current_contract_kw - 1) * 100) : 0;
  const raise = data ? data.recommended_contract_kw > data.current_contract_kw : false;

  const chartOption = data && {
    grid: { left: 44, right: 14, top: 26, bottom: 30 },
    legend: { right: 6, top: 0, itemWidth: 14, textStyle: { fontSize: 11 } },
    tooltip: {
      trigger: "axis",
      formatter: (ps: { axisValue: number; seriesName: string; value: number[] }[]) =>
        `契約 ${Math.round(ps[0].axisValue).toLocaleString()} kW<br/>` +
        ps.map((p) => `${p.seriesName} ${ntd(p.value[1])}`).join("<br/>"),
    },
    xAxis: {
      type: "value", name: "契約容量 kW", nameTextStyle: { fontSize: 10 }, nameGap: 18,
      min: data.curve[0].contract_kw, max: data.curve[data.curve.length - 1].contract_kw,
      axisLabel: { fontSize: 10, formatter: (v: number) => v.toLocaleString() },
    },
    yAxis: { type: "value", name: "NT$/年", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: (v: number) => `${(v / 1e6).toFixed(1)}M` } },
    series: [
      { name: "基本電費", type: "line", smooth: true, symbol: "none", data: data.curve.map((p) => [p.contract_kw, p.basic_nt]), lineStyle: { color: "#1677ff", width: 1.5 }, itemStyle: { color: "#1677ff" } },
      { name: "超約罰款", type: "line", smooth: true, symbol: "none", data: data.curve.map((p) => [p.contract_kw, p.penalty_nt]), lineStyle: { color: "#cf1322", width: 1.5 }, itemStyle: { color: "#cf1322" }, areaStyle: { color: "rgba(207,19,34,0.07)" } },
      {
        name: "年總成本", type: "line", smooth: true, symbol: "none",
        data: data.curve.map((p) => [p.contract_kw, p.total_nt]),
        lineStyle: { color: "#262626", width: 2.5 }, itemStyle: { color: "#262626" },
        markLine: {
          symbol: "none", silent: true,
          data: [
            { xAxis: data.current_contract_kw, label: { formatter: `現況 ${data.current_contract_kw.toLocaleString()}`, fontSize: 10, color: "#fa8c16", position: "insideStartTop" }, lineStyle: { color: "#fa8c16", type: "dashed", width: 1.5 } },
            { xAxis: data.recommended_contract_kw, label: { formatter: `最佳 ${data.recommended_contract_kw.toLocaleString()}`, fontSize: 10, color: "#52c41a", position: "insideEndTop" }, lineStyle: { color: "#52c41a", type: "dashed", width: 1.5 } },
          ],
        },
        markPoint: { symbolSize: 8, symbol: "circle", data: [{ type: "min", itemStyle: { color: "#52c41a" }, label: { show: false } }] },
      },
    ],
  };

  if (loading && !data) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr 340px", gap: 8 }}>
      {/* 左:尖峰實況 + 假設 */}
      <Card size="small" title="尖峰實況 / 假設" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        {data && (
          <>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>實測尖峰(EMS 北電錶)</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <Statistic value={data.summer_peak_kw} suffix="kW" valueStyle={{ fontSize: 22, color: "#cf1322" }} />
              {overPct > 0 && <Tag color="red">超約 {overPct}%</Tag>}
            </div>
            <div style={{ color: "#bbb", fontSize: 11, marginTop: 2, marginBottom: 10 }}>取自 2023/05–06 月最高需量,罰款計算零外推</div>

            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>現況契約容量</div>
            <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={1} step={50} value={contract} onChange={(v) => setContract(v ?? 0)} />
            <div style={{ color: "#888", fontSize: 12, margin: "8px 0 2px" }}>基本電費單價</div>
            <InputNumber size="small" style={{ width: "100%" }} addonAfter="元/kW" min={0} step={0.1} value={rate} onChange={(v) => setRate(v ?? 0)} />

            <Divider style={{ margin: "12px 0 6px" }} orientation="left" plain>全年型態假設</Divider>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
              <span>高需量月數</span><b>{highMonths} 月</b>
            </div>
            <Slider min={0} max={12} step={1} value={highMonths} onChange={setHighMonths} marks={{ 0: "0", 4: "4", 8: "8", 12: "12" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 4 }}>
              <span>離峰季尖峰比例</span><b>×{offseason.toFixed(2)}</b>
            </div>
            <Slider min={0.4} max={1} step={0.05} value={offseason} onChange={setOffseason} tooltip={{ formatter: (v) => `×${v}` }} />
            <div style={{ color: "#bbb", fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
              依自家全年型態調整:高需量月數=夏季冷氣旺月,離峰季尖峰約為夏季的幾成。
            </div>
          </>
        )}
      </Card>

      {/* 中:年成本 vs 契約 U 曲線 */}
      <Card size="small" title="年成本 vs 契約容量(基本電費↑ 罰款↓ 的權衡)" style={{ height: "100%" }}
        styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}>
        {!chartOption ? <Spin size="large" style={{ margin: "auto" }} /> : (
          <>
            <ReactECharts option={chartOption} style={{ flex: 1, minHeight: 0 }} notMerge />
            <div style={{ color: "#999", fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
              黑線最低點=最佳契約;基本電費按契約整年收,故調高雖降罰款卻墊高基本,U 形底部常很平。
            </div>
          </>
        )}
      </Card>

      {/* 右:結論 */}
      <Card size="small" title="結論 / 建議" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        {data && (
          <>
            <div style={{ background: "#fff1f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ color: "#888", fontSize: 12 }}>削峰至契約內,全年可省</div>
              <div style={{ fontSize: 27, fontWeight: 700, color: "#cf1322", lineHeight: 1.2 }}>NT$ {wan(data.peakshave_savings_nt)}</div>
              <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>
                = 現況全年超約罰款。把 {data.summer_peak_kw.toLocaleString()} kW 尖峰壓回契約 {data.current_contract_kw.toLocaleString()} kW 內即免罰。
              </div>
            </div>

            <Alert style={{ marginTop: 10 }} type={raise ? "warning" : "info"} showIcon
              message={<span style={{ fontSize: 13 }}>建議契約 <b>{data.recommended_contract_kw.toLocaleString()} kW</b></span>}
              description={<span style={{ fontSize: 12 }}>純調契約全年估省 <b style={{ color: data.annual_savings_nt > 0 ? "#3f8600" : "#888" }}>NT$ {wan(data.annual_savings_nt)}</b>{data.annual_savings_nt < 50000 ? "(與現況接近,單靠調約效益有限 → 削峰才是解)" : ""}</span>} />

            <Divider style={{ margin: "12px 0 8px" }} orientation="left" plain>現況年成本拆解</Divider>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
              <span style={{ color: "#666" }}>基本電費(契約 × 單價 × 12)</span><b>{ntd(data.current_annual_nt - data.current_penalty_nt)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
              <span style={{ color: "#cf1322" }}>超約罰款(2/3 倍級距)</span><b style={{ color: "#cf1322" }}>{ntd(data.current_penalty_nt)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid #f0f0f0", marginTop: 2, fontWeight: 700 }}>
              <span>年總成本</span><span>{ntd(data.current_annual_nt)}</span>
            </div>

            <Divider style={{ margin: "12px 0 6px" }} orientation="left" plain>實測各月超約罰款(零外推)</Divider>
            {data.measured.map((m) => (
              <div key={m.month} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                <span style={{ color: "#555" }}>{m.month} 尖峰 {m.peak_kw.toLocaleString()} kW</span>
                <span style={{ color: m.penalty_nt > 0 ? "#cf1322" : "#3f8600" }}>
                  {m.overshoot_kw > 0 ? `超 ${m.overshoot_kw.toLocaleString()} → ${ntd(m.penalty_nt)}` : "未超約"}
                </span>
              </div>
            ))}
            <div style={{ color: "#bbb", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>{data.note}</div>
          </>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// 視圖 ③ 時間電價電費
// ============================================================================
const PERIOD_COLOR: Record<string, string> = { "尖峰": "#ff4d4f", "半尖峰": "#fa8c16", "離峰": "#52c41a" };

function RateField({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: "#666" }}>{label}</span>
      <InputNumber size="small" style={{ width: 110 }} addonAfter={unit} min={0} step={0.01} value={value} onChange={(v) => onChange(v ?? 0)} />
    </div>
  );
}

function BillView({ contract, setContract }: { contract: number; setContract: (n: number) => void }) {
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [rates, setRates] = useState<TariffRates>();
  const [note, setNote] = useState<string>("");
  const [bill, setBill] = useState<MonthlyBill>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tariff().then((t) => { setRates(t.rates); setNote(t.window_note); })
      .catch((e) => message.error(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (!rates) return;
    const m = month.format("YYYY-MM");
    const t = setTimeout(() => {
      setLoading(true);
      api.bill({ month: m, contract_capacity_kw: contract, rates })
        .then(setBill).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [month, contract, rates]);

  const set = (k: keyof TariffRates) => (v: number) => setRates((r) => r && { ...r, [k]: v });
  const summer = bill?.season === "夏月";

  const chartOption = bill && {
    tooltip: { trigger: "item", formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br/>${ntd(p.value)} (${p.percent}%)` },
    legend: { type: "scroll", orient: "vertical", right: 0, top: "middle", textStyle: { fontSize: 11 } },
    series: [{
      type: "pie", radius: ["46%", "70%"], center: ["38%", "50%"], avoidLabelOverlap: true, label: { show: false },
      data: [
        ...bill.energy_lines.map((l) => ({ name: `流動·${l.period}`, value: l.charge, itemStyle: { color: PERIOD_COLOR[l.period] } })),
        { name: "基本電費", value: bill.basic_charge, itemStyle: { color: "#1677ff" } },
        ...(bill.overshoot_penalty > 0 ? [{ name: "超約罰款", value: bill.overshoot_penalty, itemStyle: { color: "#cf1322" } }] : []),
      ],
    }],
    graphic: { type: "text", left: "32%", top: "44%", style: { text: `月電費\n${ntd(bill.total)}`, textAlign: "center", fill: "#444", fontSize: 13 } },
  };

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "300px 1fr 330px", gap: 8 }}>
      {/* 左:月份 + 契約 + 可編輯費率 */}
      <Card size="small" title="計費條件 / 費率(可編輯)" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>計費月份</div>
            <DatePicker size="small" picker="month" style={{ width: "100%" }} value={month} format="YYYY-MM" allowClear={false} onChange={(d) => d && setMonth(d)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>契約容量</div>
            <InputNumber size="small" style={{ width: "100%" }} addonAfter="kW" min={1} step={50} value={contract} onChange={(v) => setContract(v ?? 0)} />
          </div>
        </div>

        {!rates ? <Spin /> : (
          <>
            <Divider style={{ margin: "6px 0 8px" }} orientation="left" plain>夏月(6–9月)</Divider>
            <RateField label="尖峰流動" unit="元/度" value={rates.summer_peak_kwh} onChange={set("summer_peak_kwh")} />
            <RateField label="半尖峰流動" unit="元/度" value={rates.summer_midpeak_kwh} onChange={set("summer_midpeak_kwh")} />
            <RateField label="離峰流動" unit="元/度" value={rates.summer_offpeak_kwh} onChange={set("summer_offpeak_kwh")} />
            <RateField label="基本電費" unit="元/kW" value={rates.basic_summer_kw} onChange={set("basic_summer_kw")} />

            <Divider style={{ margin: "10px 0 8px" }} orientation="left" plain>非夏月(無尖峰)</Divider>
            <RateField label="半尖峰流動" unit="元/度" value={rates.nonsummer_midpeak_kwh} onChange={set("nonsummer_midpeak_kwh")} />
            <RateField label="離峰流動" unit="元/度" value={rates.nonsummer_offpeak_kwh} onChange={set("nonsummer_offpeak_kwh")} />
            <RateField label="基本電費" unit="元/kW" value={rates.basic_nonsummer_kw} onChange={set("basic_nonsummer_kw")} />

            <div style={{ color: "#bbb", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
              費率為預設值,請依台電最新電價表/自家合約校正。{note}
            </div>
          </>
        )}
      </Card>

      {/* 中:電費組成 */}
      <Card size="small" title="月電費組成" style={{ height: "100%" }}
        styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}
        extra={bill && <Tag color={summer ? "volcano" : "blue"}>{bill.season}</Tag>}>
        {loading || !chartOption ? <Spin size="large" style={{ margin: "auto" }} /> : (
          <>
            <ReactECharts option={chartOption} style={{ flex: 1, minHeight: 0 }} notMerge />
            <div style={{ color: "#999", fontSize: 11, textAlign: "center", lineHeight: 1.4 }}>
              逐時 kW 以 1 小時積分為度數;台電以 15 分鐘需量計,此為規劃估算。
            </div>
          </>
        )}
      </Card>

      {/* 右:明細 */}
      <Card size="small" title="月電費明細" style={{ height: "100%" }} styles={{ body: { overflow: "auto", height: "calc(100% - 39px)" } }}>
        {!bill ? <Spin /> : (
          <>
            <Statistic title="預估月電費" value={Math.round(bill.total)} prefix="NT$" valueStyle={{ fontSize: 24, color: "#1677ff" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", margin: "4px 0 10px" }}>
              <span>{bill.season} · {bill.month}</span>
              <span>全月最高需量 {bill.peak_kw.toLocaleString()} kW</span>
            </div>

            <Divider style={{ margin: "6px 0" }} orientation="left" plain>流動電費</Divider>
            {bill.energy_lines.map((l) => (
              <div key={l.period} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Tag color={PERIOD_COLOR[l.period]} style={{ marginInlineEnd: 4 }}>{l.period}</Tag>{l.kwh.toLocaleString()} 度 × {l.rate}</span>
                  <b>{ntd(l.charge)}</b>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", fontWeight: 600 }}>
              <span>流動電費小計</span><span>{ntd(bill.energy_charge)}</span>
            </div>

            <Divider style={{ margin: "6px 0" }} orientation="left" plain>基本電費 / 罰款</Divider>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span>基本電費(契約 {bill.contract_capacity_kw.toLocaleString()} × {bill.basic_rate})</span>
              <b>{ntd(bill.basic_charge)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span style={{ color: bill.overshoot_penalty > 0 ? "#cf1322" : "#999" }}>
                超約罰款{bill.overshoot_kw > 0 ? `(超 ${bill.overshoot_kw.toLocaleString()} kW)` : ""}
              </span>
              <b style={{ color: bill.overshoot_penalty > 0 ? "#cf1322" : "#999" }}>{ntd(bill.overshoot_penalty)}</b>
            </div>

            <Divider style={{ margin: "8px 0 6px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
              <span>月電費合計</span><span style={{ color: "#1677ff" }}>{ntd(bill.total)}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
