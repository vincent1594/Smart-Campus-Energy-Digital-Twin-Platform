// 微電網頁:C/D 棟、Z 棟 (西淮館) 的太陽能 / 儲能 / 發電機 —— 依竣工圖 ESS-2.1 建模,
// 掛在 TR_CD、TR_Z_MAIN 的 220V 側。目前只有北電錶有微電網,故固定讀北網 (不隨南北切換)。
import { Alert, Card, Statistic, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { DerAsset, DerKind } from "../api/types";
import ScenarioBadge from "../components/ScenarioBadge";
import Table from "../components/ResizableTable";
import { useFocus } from "../focus/FocusContext";
import { useFitPageSize } from "../lib/useFillHeight";
import { useNetScenario } from "../scenario/ActiveScenarioContext";

const NET = "north";

const DER_KIND: Record<DerKind, { label: string; color: string; icon: string }> = {
  pv: { label: "太陽能", color: "green", icon: "☀" },
  ess: { label: "儲能", color: "cyan", icon: "🔋" },
  gen: { label: "發電機", color: "orange", icon: "⚡" },
};

export default function Microgrid() {
  const [rows, setRows] = useState<DerAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const { setFocus } = useFocus();
  const navigate = useNavigate();
  const fh = useFitPageSize(150);
  // 情境連動:北網有套用情境時,出力改取情境潮流結果
  const { scenario } = useNetScenario(NET);
  const sOut = useMemo(() => new Map(scenario?.der_outputs?.map((o) => [o.der_id, o]) ?? []), [scenario]);
  const out = (r: DerAsset) => sOut.get(r.der_id) ?? { power_kw: r.power_kw, in_service: r.in_service };
  useEffect(() => {
    api.derOf(NET).then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);
  const sum = (k: DerKind, f: (r: DerAsset) => number) => rows.filter((r) => r.kind === k).reduce((s, r) => s + f(r), 0);

  return (
    <Card title="微電網 · 太陽能 / 儲能 / 發電機" extra={<span style={{ color: "#999", fontSize: 12 }}>北電錶 · C/D 棟、Z 棟 (西淮館)</span>}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "auto", padding: "8px 12px" } }}>
      <ScenarioBadge />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "4px 0 8px" }}>
        <Statistic title="☀ 太陽能" value={sum("pv", (r) => r.kwp ?? 0)} precision={2} suffix="kWp" />
        <Statistic title="🔋 儲能" value={`${sum("ess", (r) => r.rating_kw)} kW / ${sum("ess", (r) => r.energy_kwh ?? 0)} kWh`} />
        <Statistic title="⚡ 發電機" value={sum("gen", (r) => r.rating_kw)} suffix="kW" />
        <Statistic title="目前發電" value={rows.reduce((s, r) => s + Math.max(0, out(r).power_kw), 0)} precision={1} suffix="kW" />
      </div>
      {!scenario && (
        <Alert type="info" showIcon style={{ marginBottom: 8 }}
          message={<>基準情境 (2023/06/08 14:00 實測淨值) 未拆分太陽能,出力顯示 0;儲能待機、發電機備用。到<a onClick={() => navigate("/scenario")}>「規劃模擬」</a>選時間點可看各設備出力。</>} />
      )}
      <div ref={fh.ref}>
        <Table<DerAsset> rowKey="der_id" size="small" dataSource={rows} loading={loading} pagination={{ pageSize: fh.pageSize }}
          onRow={(r) => ({ onClick: () => { setFocus({ kind: "transformer", id: r.transformer_id, label: r.transformer_id }); navigate("/"); }, style: { cursor: "pointer" } })}
          columns={[
            { title: "站別", dataIndex: "site", width: 120 },
            { title: "設備", dataIndex: "der_id", width: 100 },
            { title: "類型", dataIndex: "kind", width: 90, render: (k: DerKind) => <Tag color={DER_KIND[k].color}>{DER_KIND[k].icon} {DER_KIND[k].label}</Tag> },
            { title: "額定 (kW)", dataIndex: "rating_kw", width: 90 },
            { title: "容量", key: "cap", width: 110, render: (_v, r) => (r.kind === "pv" ? `${r.kwp} kWp` : r.kind === "ess" ? `${r.energy_kwh} kWh` : "—") },
            { title: "目前出力 (kW)", key: "out", width: 110, render: (_v, r) => { const o = out(r); return o.in_service ? o.power_kw.toFixed(1) : <Tag>備用</Tag>; } },
            { title: "所屬變壓器", dataIndex: "transformer_id", width: 110 },
            { title: "介接", dataIndex: "interface" },
            { title: "備註", dataIndex: "note" },
            { title: "來源", dataIndex: "source", width: 210 },
          ]}
        />
      </div>
    </Card>
  );
}
