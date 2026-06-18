// 單線圖:純 SVG 高壓配電單線圖(台電→VCB→饋線→變壓器→建築),依負載率上色、點擊看詳情。
// 接 ActiveScenarioContext:套用模擬情境時整圖配色隨之連動。
import { Card, Spin, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PowerFlowResult, TopologyGraph } from "../api/types";
import DeviceDetail from "../components/DeviceDetail";
import SingleLineSvg, { type PickedNode } from "../components/SingleLineSvg";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, border: `1px solid ${color}` }} />
      <span style={{ fontSize: 11, color: "#666" }}>{label}</span>
    </span>
  );
}

export default function SingleLineDiagram() {
  const [graph, setGraph] = useState<TopologyGraph>();
  const [pf, setPf] = useState<PowerFlowResult>();
  const [selected, setSelected] = useState<PickedNode | null>(null);
  const { scenario } = useActiveScenario();

  useEffect(() => {
    Promise.all([api.topology(), api.powerflow()])
      .then(([g, p]) => { setGraph(g); setPf(p); })
      .catch((e) => message.error(String(e.message ?? e)));
  }, []);

  const result = scenario ?? pf;   // 有套用模擬情境就用情境配色
  if (!graph || !result) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 360px", gridTemplateRows: "minmax(0, 1fr)", gap: 10 }}>
      <Card size="small" title={<span>高壓配電單線圖 {scenario && <Tag color="orange" style={{ marginInlineStart: 6 }}>模擬情境</Tag>}</span>}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
        styles={{ body: { flex: 1, minHeight: 0, padding: 8 } }}
        extra={
          <span>
            <LegendDot color="#52c41a" label="低載 <80%" />
            <LegendDot color="#fa8c16" label="吃緊 80–100%" />
            <LegendDot color="#ff4d4f" label="過載 >100%" />
            <LegendDot color="#bfbfbf" label="無負載率" />
          </span>
        }>
        <SingleLineSvg graph={graph} pf={result} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </Card>

      <Card size="small" title="設備詳情"
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
        styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
        <DeviceDetail selected={selected} />
      </Card>
    </div>
  );
}
