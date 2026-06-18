import { Alert, Card, Spin, Table, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { PowerFlowResult } from "../api/types";
import { kindLabel, useFocus, type FocusKind } from "../focus/FocusContext";
import { useActiveScenario } from "../scenario/ActiveScenarioContext";

interface Alarm { level: string; kind: FocusKind; id: string; equipment: string; message: string }

export default function Alarms() {
  const [pf, setPf] = useState<PowerFlowResult>();
  const [err, setErr] = useState<string>();
  const { setFocus } = useFocus();
  const { scenario } = useActiveScenario();
  const navigate = useNavigate();

  useEffect(() => { api.powerflow().then(setPf).catch((e) => setErr(String(e.message ?? e))); }, []);

  // 有套用模擬情境就用情境結果,否則用現況潮流(與地圖/KPI 連動)
  const result = scenario ?? pf;

  const alarms = useMemo<Alarm[]>(() => {
    if (!result) return [];
    const pf = result;
    const out: Alarm[] = [];
    pf.transformer_loadings.filter((t) => t.load_ratio_percent >= 80).forEach((t) =>
      out.push({ level: t.load_ratio_percent > 100 ? "警告" : "注意", kind: "transformer", id: t.transformer_id, equipment: t.transformer_name, message: `變壓器負載率 ${t.load_ratio_percent.toFixed(1)}%（容量 ${t.capacity_kva} kVA）` }));
    pf.feeder_loadings.filter((f) => f.load_ratio_percent >= 80).forEach((f) =>
      out.push({ level: f.load_ratio_percent > 100 ? "警告" : "注意", kind: "feeder", id: f.feeder_id, equipment: f.feeder_name, message: `饋線負載率 ${f.load_ratio_percent.toFixed(1)}%` }));
    pf.building_voltages.filter((b) => b.voltage_pu < 0.95).forEach((b) =>
      out.push({ level: "注意", kind: "building", id: b.building_id, equipment: b.building_name, message: `電壓偏低 ${b.voltage_pu.toFixed(4)} pu` }));
    // 警告在前
    return out.sort((a, b) => (a.level === "警告" ? -1 : 1) - (b.level === "警告" ? -1 : 1));
  }, [result]);

  if (err) return <Alert type="error" message="無法載入" description={err} showIcon />;
  if (!result) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <Card title={<span>告警紀錄 {scenario && <Tag color="orange" style={{ marginInlineStart: 6 }}>模擬情境</Tag>}</span>} size="small" style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}
      extra={<span style={{ color: "#999", fontSize: 12 }}>{scenario ? "模擬情境的越限項目" : "現況潮流快照的越限項目"}(非歷史事件流);點一筆可在地圖定位</span>}>
      <Table<Alarm> rowKey={(r) => r.kind + r.id} size="small" dataSource={alarms} pagination={false}
        locale={{ emptyText: "目前無告警 — 所有設備負載率 < 80%、電壓正常" }}
        onRow={(r) => ({ onClick: () => { setFocus({ kind: r.kind, id: r.id, label: r.equipment }); navigate("/"); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "等級", dataIndex: "level", width: 80, render: (l) => <Tag color={l === "警告" ? "orange" : "blue"}>{l}</Tag> },
          { title: "類型", dataIndex: "kind", width: 90, render: (k: FocusKind) => kindLabel[k] },
          { title: "設備", dataIndex: "equipment", width: 240 },
          { title: "訊息", dataIndex: "message" },
        ]} />
    </Card>
  );
}
