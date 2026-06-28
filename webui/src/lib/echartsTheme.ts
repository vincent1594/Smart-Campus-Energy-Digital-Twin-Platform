// 全站共用 echarts 淺色主題「bg」——統一配色盤、柔化座標軸/格線、tooltip 圓角陰影。
// 在 main.tsx import 一次即註冊;各 <ReactECharts theme="bg" /> 套用。
// 主題只提供「預設值」,各圖 option 內顯式設定仍會覆寫(故不破壞既有刻意配色)。
import * as echarts from "echarts";

const palette = ["#1677ff", "#52c41a", "#fa8c16", "#ff4d4f", "#13c2c2", "#722ed1", "#2f54eb", "#eb2f96"];
const FONT = 'system-ui, -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif';
const AXIS = "#8893a3";
const SPLIT = "#eef1f5";

echarts.registerTheme("bg", {
  color: palette,
  backgroundColor: "transparent",
  textStyle: { fontFamily: FONT, color: "#5a6473" },
  title: { textStyle: { color: "#2a2a2a", fontWeight: 600 }, subtextStyle: { color: "#8c8c8c" } },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#e4e8ee" } },
    axisTick: { show: false },
    axisLabel: { color: AXIS },
    splitLine: { show: false, lineStyle: { color: [SPLIT] } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: AXIS },
    splitLine: { lineStyle: { color: [SPLIT] } },
  },
  legend: { textStyle: { color: "#666" } },
  tooltip: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderColor: "#eef1f5",
    borderWidth: 1,
    textStyle: { color: "#2a2a2a", fontSize: 12 },
    extraCssText: "box-shadow: 0 6px 22px rgba(20,40,80,0.12); border-radius: 8px; backdrop-filter: blur(4px);",
    axisPointer: { lineStyle: { color: "#c8d2e0" }, crossStyle: { color: "#c8d2e0" } },
  },
  bar: { itemStyle: { borderRadius: [3, 3, 0, 0] } },
});
