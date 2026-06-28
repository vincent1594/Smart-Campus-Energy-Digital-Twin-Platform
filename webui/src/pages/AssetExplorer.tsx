import { Button, Card, Descriptions, Drawer, Input, InputNumber, List, Progress, Segmented, Statistic, Table, Tabs, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, getNetwork, setNetwork } from "../api/client";
import type { FeederDetail, ReplacementEconomics, ReplacementEconomicsReport, TransformerDetail, TransformerRisk, TransformerSpec, VcbDetail } from "../api/types";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";
import { downloadCSV, stamp } from "../lib/csv";
import { useFitPageSize } from "../lib/useFillHeight";
import { useNetScenario } from "../scenario/ActiveScenarioContext";
import { feederRatioMap, loadScale, trafoRatioMap } from "../lib/scenarioScale";
import ScenarioBadge from "../components/ScenarioBadge";
import { BuildingsPanel } from "./BuildingExplorer";

const RISK_COLOR: Record<string, string> = { "高": "#ff4d4f", "中": "#fa8c16", "低": "#52c41a" };

function Transformers() {
  const [rows, setRows] = useState<TransformerDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TransformerDetail | null>(null);
  const { setFocus } = useFocus();
  const fh = useFitPageSize();
  // 情境連動:有套用情境時,負載率帶到情境值;連接負載按「情境率/基準率」縮放。容量/結構維持 base。
  const { scenario } = useNetScenario();
  const sMap = useMemo(() => trafoRatioMap(scenario), [scenario]);
  const effRatio = (r: TransformerDetail) => (scenario ? sMap.get(r.id) ?? r.load_ratio_percent : r.load_ratio_percent);
  const effLoad = (r: TransformerDetail) => (scenario
    ? Math.round(r.total_connected_load_kw * loadScale(sMap.get(r.id), r.load_ratio_percent) * 10) / 10
    : r.total_connected_load_kw);
  useEffect(() => {
    setLoading(true);
    api.transformers().then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);
  return (
    <>
      <ScenarioBadge />
      <div ref={fh.ref}>
      <Table<TransformerDetail>
        rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: fh.pageSize }}
        onRow={(r) => ({ onClick: () => { setDetail(r); setFocus({ kind: "transformer", id: r.id, label: r.name }); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "id" },
          { title: "容量 (kVA)", dataIndex: "capacity_kva", align: "right", sorter: (a, b) => a.capacity_kva - b.capacity_kva },
          { title: "型式", dataIndex: "trafo_type", render: (t) => <Tag>{t}式</Tag> },
          { title: "二次側額定", dataIndex: "lv_kv", render: (v: number) => lvLabel(v) },
          { title: "所屬 VCB", dataIndex: "vcb_name" },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", sorter: (a, b) => (effRatio(a) ?? 0) - (effRatio(b) ?? 0), render: (_v, r) => <LoadRatioTag ratio={effRatio(r)} /> },
          { title: "連接負載點", dataIndex: "connected_building_count", align: "right" },
        ]}
      />
      </div>
      <Drawer width={480} open={!!detail} onClose={() => setDetail(null)} title={detail ? `變壓器:${detail.name}` : ""}>
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="容量">{detail.capacity_kva} kVA</Descriptions.Item>
              <Descriptions.Item label="型式">{detail.trafo_type}式</Descriptions.Item>
              <Descriptions.Item label="一次側額定">11.4 kV<span style={{ color: "#999", fontSize: 12 }}>(允許 {rangeKV(11.4)} kV)</span></Descriptions.Item>
              <Descriptions.Item label="二次側額定">{lvLabel(detail.lv_kv)}<span style={{ color: "#999", fontSize: 12 }}>(允許 {lvRangeLabel(detail.lv_kv)})</span></Descriptions.Item>
              <Descriptions.Item label="負載率">{effRatio(detail)?.toFixed(1) ?? "—"}%</Descriptions.Item>
              <Descriptions.Item label="連接負載">{effLoad(detail)} kW</Descriptions.Item>
            </Descriptions>
            <List
              header={`連接負載點（${detail.connected_building_count} 個）`}
              size="small" bordered dataSource={detail.connected_buildings}
              renderItem={(b) => <List.Item>{b}</List.Item>}
            />
          </>
        )}
      </Drawer>
    </>
  );
}

function Vcbs() {
  const [rows, setRows] = useState<VcbDetail[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const { setFocus } = useFocus();
  const fh = useFitPageSize();
  // 情境連動:VCB 連接負載 = 旗下各變壓器 base 連接負載 × (情境率/基準率) 加總;需變壓器資料佐算。
  const { scenario } = useNetScenario();
  const sMap = useMemo(() => trafoRatioMap(scenario), [scenario]);
  const trByName = useMemo(() => new Map(trafos.map((t) => [t.name, t])), [trafos]);
  const effLoad = (vcb: VcbDetail) => {
    if (!scenario || trByName.size === 0) return vcb.total_connected_load_kw;   // 無情境 / 變壓器未載入 → base
    let sum = 0;
    for (const name of vcb.transformers) {
      const t = trByName.get(name);
      if (t) sum += t.total_connected_load_kw * loadScale(sMap.get(t.id), t.load_ratio_percent);
    }
    return Math.round(sum * 10) / 10;
  };
  useEffect(() => {
    api.vcbs().then(setRows).catch((e) => message.error(String(e.message ?? e)));
    api.transformers().then(setTrafos).catch(() => undefined);
  }, []);
  return (
    <>
    <ScenarioBadge />
    <div ref={fh.ref}>
    <Table<VcbDetail> rowKey="id" size="small" dataSource={rows} pagination={{ pageSize: fh.pageSize }}
      onRow={(r) => ({ onClick: () => setFocus({ kind: "vcb", id: r.id, label: r.name }), style: { cursor: "pointer" } })}
      columns={[
        { title: "編號", dataIndex: "id" },
        { title: "名稱", dataIndex: "name" },
        { title: "饋線數", dataIndex: "feeder_count", align: "right" },
        { title: "變壓器數", dataIndex: "transformer_count", align: "right" },
        { title: "連接負載點", dataIndex: "connected_building_count", align: "right" },
        { title: "連接負載 (kW)", dataIndex: "total_connected_load_kw", align: "right", sorter: (a, b) => effLoad(a) - effLoad(b), render: (_v, r) => effLoad(r) },
      ]}
    />
    </div>
    </>
  );
}

function Feeders() {
  const [rows, setRows] = useState<FeederDetail[]>([]);
  const { setFocus } = useFocus();
  const fh = useFitPageSize(100);
  // 情境連動:有套用情境時,饋線負載率帶到情境值 (容量/線徑/長度維持 base)。
  const { scenario } = useNetScenario();
  const fMap = useMemo(() => feederRatioMap(scenario), [scenario]);
  const effRatio = (r: FeederDetail) => (scenario ? fMap.get(r.id) ?? r.load_ratio_percent : r.load_ratio_percent);
  useEffect(() => { api.feeders().then(setRows).catch((e) => message.error(String(e.message ?? e))); }, []);
  return (
    <>
    <ScenarioBadge />
    <div ref={fh.ref}>
      <Table<FeederDetail> rowKey="id" size="small" dataSource={rows} pagination={{ pageSize: fh.pageSize }}
        onRow={(r) => ({ onClick: () => setFocus({ kind: "feeder", id: r.id, label: r.name }), style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "id" },
          { title: "所屬 VCB", dataIndex: "vcb_name" },
          { title: "線徑", dataIndex: "cross_section_mm2", align: "right", width: 84, render: (v: number | null) => (v != null ? `${v} mm²` : "—") },
          { title: <span>長度 <Tag color="default" style={{ marginInlineStart: 2, fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>估</Tag></span>, dataIndex: "length_m", align: "right", width: 96, render: (v: number) => `${v.toFixed(0)} m`, sorter: (a, b) => a.length_m - b.length_m },
          { title: "R (Ω)", dataIndex: "resistance_ohm", align: "right", width: 82, render: (v: number | null) => (v != null ? v.toFixed(3) : "—"), sorter: (a, b) => (a.resistance_ohm ?? 0) - (b.resistance_ohm ?? 0) },
          { title: "X (Ω)", dataIndex: "reactance_ohm", align: "right", width: 82, render: (v: number | null) => (v != null ? v.toFixed(3) : "—") },
          { title: "變壓器數", dataIndex: "transformer_count", align: "right" },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", sorter: (a, b) => (effRatio(a) ?? 0) - (effRatio(b) ?? 0), render: (_v, r) => <LoadRatioTag ratio={effRatio(r)} /> },
          { title: "連接負載點", dataIndex: "connected_building_count", align: "right" },
        ]}
      />
      <div style={{ color: "#bbb", fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
        長度為推估值(實際佈線未量測);R/X 依線徑單位阻抗（60mm² 0.32+j0.07、38mm² 0.5+j0.07 Ω/km）× 長度推算。
      </div>
    </div>
    </>
  );
}

// 規格明細:忠實呈現各站變壓器原始銘牌/實測資料(供營繕組核對,不對應潮流模型)
function Specs() {
  const [rows, setRows] = useState<TransformerSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<TransformerSpec | null>(null);
  useEffect(() => {
    setLoading(true);
    api.transformerSpecs().then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => `${r.tag} ${r.building} ${r.circuit} ${r.brand}`.toLowerCase().includes(k));
  }, [rows, q]);
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const fh = useFitPageSize();
  return (
    <>
      <Input.Search allowClear placeholder="搜尋 編號 / 建築物 / 迴路 / 廠牌" value={q}
        onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 8 }} />
      <div ref={fh.ref}>
      <Table<TransformerSpec>
        rowKey="seq" loading={loading} dataSource={filtered} size="small"
        pagination={{ pageSize: fh.pageSize }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "tag", width: 70 },
          { title: "建築物", dataIndex: "building" },
          { title: "容量(kVA)", dataIndex: "capacity_kva", align: "right", sorter: (a, b) => (a.capacity_kva ?? 0) - (b.capacity_kva ?? 0) },
          { title: "型式", dataIndex: "trafo_type", render: (t) => (t ? <Tag>{t}</Tag> : "—") },
          { title: "二次側額定", dataIndex: "lv_v", render: (v) => (v ? `${v} V` : "—") },
          { title: "二次側實測", dataIndex: "lv_actual_v", render: (v) => (v ? `${v} V` : "—") },
          { title: "功因", dataIndex: "power_factor", align: "right", render: (v) => v ?? "—" },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "right", sorter: (a, b) => (a.load_ratio_percent ?? 0) - (b.load_ratio_percent ?? 0), render: pct },
        ]}
      />
      </div>
      <Drawer width={460} open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `${detail.tag}｜${detail.building}` : ""}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="序號">{detail.seq}</Descriptions.Item>
            <Descriptions.Item label="建築物">{detail.building}</Descriptions.Item>
            <Descriptions.Item label="變壓器編號">{detail.tag}</Descriptions.Item>
            <Descriptions.Item label="廠牌">{detail.brand || "—"}</Descriptions.Item>
            <Descriptions.Item label="製造年份">{detail.year || "—"}</Descriptions.Item>
            <Descriptions.Item label="容量">{detail.capacity_kva ?? "—"} kVA</Descriptions.Item>
            <Descriptions.Item label="型式">{detail.trafo_type || "—"}</Descriptions.Item>
            <Descriptions.Item label="迴路名稱">{detail.circuit || "—"}</Descriptions.Item>
            <Descriptions.Item label="負載概述">{detail.load_desc || "—"}</Descriptions.Item>
            <Descriptions.Item label="一次側額定電壓">{detail.hv_kv || "—"} kV</Descriptions.Item>
            <Descriptions.Item label="二次側額定電壓">{detail.lv_v || "—"} V</Descriptions.Item>
            <Descriptions.Item label="一次側實際電壓">{detail.hv_actual_kv || "—"} kV</Descriptions.Item>
            <Descriptions.Item label="二次側實際電壓">{detail.lv_actual_v || "—"} V</Descriptions.Item>
            <Descriptions.Item label="負載電流">{detail.load_current_a ?? "—"} A</Descriptions.Item>
            <Descriptions.Item label="功因">{detail.power_factor ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="平均負載">{detail.avg_load_kw ?? "—"} kW</Descriptions.Item>
            <Descriptions.Item label="負載率">{pct(detail.load_ratio_percent)}</Descriptions.Item>
            <Descriptions.Item label="效率 η">{detail.efficiency ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="變壓器溫度">{detail.temperature_c ?? "—"} °C</Descriptions.Item>
            <Descriptions.Item label="功因自動調整器">{detail.pf_regulator || "—"}</Descriptions.Item>
            <Descriptions.Item label="裝置電容器量">{detail.capacitor_kvar ?? "—"} kVAr</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}

// 汰換優先序:依屆齡/負載/溫度/效率算風險分數降冪排序,供資本門設備汰換規劃
function Replacement() {
  const [rows, setRows] = useState<TransformerRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TransformerRisk | null>(null);
  useEffect(() => {
    setLoading(true);
    api.replacementPriority().then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { 高: 0, 中: 0, 低: 0 } as Record<string, number>;
    rows.forEach((r) => { c[r.risk_level] = (c[r.risk_level] ?? 0) + 1; });
    return c;
  }, [rows]);

  const exportCsv = () => downloadCSV<TransformerRisk>(`設備汰換建議表_${stamp()}.csv`, rows, [
    { label: "汰換優先序", value: (r) => rows.indexOf(r) + 1 },
    { label: "編號", value: (r) => r.tag },
    { label: "建築物", value: (r) => r.building },
    { label: "廠牌", value: (r) => r.brand },
    { label: "製造年份", value: (r) => r.year },
    { label: "屆齡(年)", value: (r) => r.age_years ?? "" },
    { label: "容量(kVA)", value: (r) => r.capacity_kva ?? "" },
    { label: "負載率(%)", value: (r) => r.load_ratio_percent ?? "" },
    { label: "實測溫度(°C)", value: (r) => r.temperature_c ?? "" },
    { label: "效率", value: (r) => r.efficiency ?? "" },
    { label: "風險分數", value: (r) => r.risk_score },
    { label: "風險等級", value: (r) => r.risk_level },
    { label: "建議", value: (r) => r.reason },
  ]);
  const fh = useFitPageSize();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#666" }}>
          共 {rows.length} 台 ·
          <Tag color={RISK_COLOR["高"]} style={{ marginInline: 6 }}>高 {counts["高"] ?? 0}</Tag>
          <Tag color={RISK_COLOR["中"]}>中 {counts["中"] ?? 0}</Tag>
          <Tag color={RISK_COLOR["低"]}>低 {counts["低"] ?? 0}</Tag>
          <span style={{ color: "#bbb", marginLeft: 6 }}>風險=屆齡0.40+負載0.25+溫度0.20+效率0.15,相對排序供規劃,需現場檢測佐證</span>
        </span>
        <Button size="small" onClick={exportCsv} disabled={!rows.length}>匯出汰換建議表 (CSV)</Button>
      </div>
      <div ref={fh.ref}>
      <Table<TransformerRisk>
        rowKey="tag" loading={loading} dataSource={rows} size="small"
        pagination={{ pageSize: fh.pageSize }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: "pointer" } })}
        columns={[
          { title: "序", render: (_v, _r, i) => i + 1, width: 48, align: "center" },
          { title: "編號", dataIndex: "tag", width: 70 },
          { title: "建築物", dataIndex: "building", ellipsis: true },
          { title: "容量", dataIndex: "capacity_kva", align: "right", width: 76, render: (v) => (v ? `${v} kVA` : "—") },
          { title: "屆齡", dataIndex: "age_years", align: "right", width: 64, sorter: (a, b) => (a.age_years ?? 0) - (b.age_years ?? 0), render: (v) => (v != null ? `${v} 年` : "—") },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", width: 72, sorter: (a, b) => (a.load_ratio_percent ?? 0) - (b.load_ratio_percent ?? 0), render: (v) => (v != null ? `${v}%` : "—") },
          { title: "溫度", dataIndex: "temperature_c", align: "right", width: 64, render: (v) => (v != null ? `${v}°` : "—") },
          {
            title: "風險分數", dataIndex: "risk_score", width: 180,
            defaultSortOrder: "descend", sorter: (a, b) => a.risk_score - b.risk_score,
            render: (v: number, r) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Progress percent={v} size="small" showInfo={false} strokeColor={RISK_COLOR[r.risk_level]} style={{ flex: 1, margin: 0 }} />
                <b style={{ width: 34, textAlign: "right", color: RISK_COLOR[r.risk_level] }}>{v}</b>
                <Tag color={RISK_COLOR[r.risk_level]} style={{ margin: 0 }}>{r.risk_level}</Tag>
              </div>
            ),
          },
          { title: "主要風險 / 建議", dataIndex: "reason", ellipsis: true },
        ]}
      />
      </div>
      <Drawer width={460} open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `${detail.tag}｜${detail.building}` : ""}>
        {detail && (
          <>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Progress type="dashboard" percent={detail.risk_score} strokeColor={RISK_COLOR[detail.risk_level]}
                format={(p) => <span style={{ color: RISK_COLOR[detail.risk_level] }}>{p}<div style={{ fontSize: 13 }}>{detail.risk_level}風險</div></span>} />
              <div style={{ marginTop: 6, color: "#555" }}>{detail.reason}</div>
            </div>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 14 }}>
              <Descriptions.Item label="廠牌 / 年份">{detail.brand || "—"} / {detail.year || "—"}（屆齡 {detail.age_years ?? "—"} 年）</Descriptions.Item>
              <Descriptions.Item label="容量 / 型式">{detail.capacity_kva ?? "—"} kVA / {detail.trafo_type || "—"}</Descriptions.Item>
              <Descriptions.Item label="負載率">{detail.load_ratio_percent != null ? `${detail.load_ratio_percent}%` : "—"}</Descriptions.Item>
              <Descriptions.Item label="實測溫度">{detail.temperature_c != null ? `${detail.temperature_c} °C` : "—"}</Descriptions.Item>
              <Descriptions.Item label="效率">{detail.efficiency ?? "—"}</Descriptions.Item>
            </Descriptions>
            <h4 style={{ margin: "0 0 8px" }}>風險因子分解</h4>
            {detail.factors.map((f) => (
              <div key={f.name} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                  <span><b>{f.name}</b> <span style={{ color: "#999" }}>{f.detail}（權重 {f.weight}）</span></span>
                  <span>{f.score}</span>
                </div>
                <Progress percent={f.score} size="small" showInfo={false}
                  strokeColor={f.score >= 60 ? "#ff4d4f" : f.score >= 40 ? "#fa8c16" : "#52c41a"} />
              </div>
            ))}
          </>
        )}
      </Drawer>
    </>
  );
}

// 汰換投資回收:換新成本 vs 換高效機年省電費 → 回收年限,供資本門效益評估
const ntd = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;
const wan = (n: number) => `${(n / 1e4).toLocaleString(undefined, { maximumFractionDigits: 1 })} 萬`;

function Economics() {
  const [unitPrice, setUnitPrice] = useState<number>(600);
  const [energyPrice, setEnergyPrice] = useState<number>(3.0);
  const [data, setData] = useState<ReplacementEconomicsReport>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api.replacementEconomics(unitPrice, energyPrice)
        .then(setData).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [unitPrice, energyPrice]);

  const exportCsv = () => data && downloadCSV<ReplacementEconomics>(`設備汰換投資回收_${stamp()}.csv`, data.items, [
    { label: "回收序", value: (e) => data.items.indexOf(e) + 1 },
    { label: "編號", value: (e) => e.tag },
    { label: "建築物", value: (e) => e.building },
    { label: "容量(kVA)", value: (e) => e.capacity_kva ?? "" },
    { label: "型式", value: (e) => e.trafo_type },
    { label: "屆齡(年)", value: (e) => e.age_years ?? "" },
    { label: "負載率(%)", value: (e) => e.load_ratio_percent ?? "" },
    { label: "風險等級", value: (e) => e.risk_level },
    { label: "換新成本(NT$)", value: (e) => e.capex_nt },
    { label: "年省電費(NT$)", value: (e) => e.annual_saving_nt },
    { label: "年省度數(kWh)", value: (e) => e.annual_saving_kwh },
    { label: "回收年限(年)", value: (e) => e.payback_years ?? "僅風險" },
  ]);

  const paybackColor = (y: number | null) =>
    y == null ? "#bbb" : y <= 10 ? "#3f8600" : y <= 15 ? "#fa8c16" : "#cf1322";
  const fh = useFitPageSize(100);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <Statistic title="高風險汰換需投資" value={data ? Math.round(data.high_risk_capex_nt) : 0} prefix="NT$" valueStyle={{ fontSize: 18, color: "#cf1322" }}
            formatter={(v) => wan(Number(v))} />
          <Statistic title="汰換後年省電費" value={data ? Math.round(data.high_risk_annual_saving_nt) : 0} valueStyle={{ fontSize: 18, color: "#3f8600" }}
            formatter={(v) => `NT$ ${wan(Number(v))}`} />
          <Statistic title="整體回收年限" value={data?.high_risk_blended_payback_years ?? "—"} suffix="年" valueStyle={{ fontSize: 18 }} />
          <div style={{ color: "#999", fontSize: 12, maxWidth: 230, lineHeight: 1.4 }}>
            高風險群 {data?.high_risk_count ?? 0} 台合計。換新主因為風險;節能回收較長者,以可靠度為汰換理由。
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>換新單價</div>
            <InputNumber size="small" addonAfter="元/kVA" min={1} step={50} value={unitPrice} onChange={(v) => setUnitPrice(v ?? 0)} style={{ width: 150 }} />
          </div>
          <div>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>電價</div>
            <InputNumber size="small" addonAfter="元/度" min={0.1} step={0.1} value={energyPrice} onChange={(v) => setEnergyPrice(v ?? 0)} style={{ width: 140 }} />
          </div>
          <Button size="small" onClick={exportCsv} disabled={!data?.items.length}>匯出回收評估 (CSV)</Button>
        </div>
      </div>

      <div ref={fh.ref}>
      <Table<ReplacementEconomics>
        rowKey="tag" loading={loading} dataSource={data?.items ?? []} size="small"
        pagination={{ pageSize: fh.pageSize }}
        columns={[
          { title: "回收序", render: (_v, _r, i) => i + 1, width: 64, align: "center" },
          { title: "編號", dataIndex: "tag", width: 70 },
          { title: "建築物", dataIndex: "building", ellipsis: true },
          { title: "容量", dataIndex: "capacity_kva", align: "right", width: 76, render: (v) => (v ? `${v} kVA` : "—") },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", width: 72, render: (v) => (v != null ? `${v}%` : "—") },
          { title: "風險", dataIndex: "risk_level", align: "center", width: 60, render: (v: string) => <Tag color={RISK_COLOR[v]} style={{ margin: 0 }}>{v}</Tag> },
          { title: "換新成本", dataIndex: "capex_nt", align: "right", width: 110, sorter: (a, b) => a.capex_nt - b.capex_nt, render: (v) => ntd(v) },
          { title: "年省電費", dataIndex: "annual_saving_nt", align: "right", width: 110, sorter: (a, b) => a.annual_saving_nt - b.annual_saving_nt, render: (v) => <span style={{ color: "#3f8600" }}>{ntd(v)}</span> },
          {
            title: "回收年限", dataIndex: "payback_years", width: 120, align: "right",
            defaultSortOrder: "ascend",
            sorter: (a, b) => (a.payback_years ?? 9e9) - (b.payback_years ?? 9e9),
            render: (v: number | null) => <b style={{ color: paybackColor(v) }}>{v == null ? "—(僅風險)" : `${v} 年`}</b>,
          },
        ]}
      />
      </div>
      <div style={{ color: "#bbb", fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>{data?.loss_note}</div>
    </>
  );
}

export default function AssetExplorer() {
  // 南北電錶切換:與地圖共用同一 currentNetwork;切換後各分頁以新電網 key 重新掛載 → 重抓資料。
  const [net, setNet] = useState(getNetwork());
  const switchNet = (id: string) => { if (id !== net) { setNetwork(id); setNet(id); } };
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto", padding: "8px 12px" } }}>
      <Tabs
        size="small"
        tabBarStyle={{ marginBottom: 8 }}
        tabBarExtraContent={
          <Segmented size="small" value={net} onChange={(v) => switchNet(v as string)}
            options={[{ label: "北電錶", value: "north" }, { label: "南電錶", value: "south" }]} />
        }
        items={[
          { key: "bld", label: "建築", children: <BuildingsPanel key={net} /> },
          { key: "tr", label: "變壓器", children: <Transformers key={net} /> },
          { key: "spec", label: "規格明細", children: <Specs key={net} /> },
          { key: "vcb", label: "VCB", children: <Vcbs key={net} /> },
          { key: "fd", label: "饋線", children: <Feeders key={net} /> },
          { key: "replace", label: "汰換優先序", children: <Replacement key={net} /> },
          { key: "econ", label: "汰換投資回收", children: <Economics key={net} /> },
        ]}
      />
    </Card>
  );
}
