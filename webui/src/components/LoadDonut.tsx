import ReactECharts from "echarts-for-react";

export default function LoadDonut({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  const option = {
    tooltip: { trigger: "item", formatter: "{b}: {c} kW ({d}%)" },
    legend: { type: "scroll", orient: "vertical", right: 0, top: "middle", textStyle: { fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        data: data.sort((a, b) => b.value - a.value),
      },
    ],
    graphic: {
      type: "text",
      left: "33%",
      top: "44%",
      style: { text: `總負載\n${total.toLocaleString()} kW`, textAlign: "center", fill: "#555", fontSize: 13 },
    },
  };
  return <ReactECharts theme="bg" option={option} style={{ height: 280 }} />;
}
