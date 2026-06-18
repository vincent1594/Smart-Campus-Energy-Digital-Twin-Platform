import { Button, Card, Descriptions, Drawer, Input, List, Progress, Table, Tabs, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { FeederDetail, TransformerDetail, TransformerRisk, TransformerSpec, VcbDetail } from "../api/types";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";
import { downloadCSV, stamp } from "../lib/csv";

const RISK_COLOR: Record<string, string> = { "高": "#ff4d4f", "中": "#fa8c16", "低": "#52c41a" };

function Transformers() {
  const [rows, setRows] = useState<TransformerDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TransformerDetail | null>(null);
  const { setFocus } = useFocus();
  useEffect(() => {
    setLoading(true);
    api.transformers().then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  }, []);
  return (
    <>
      <Table<TransformerDetail>
        rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 8 }} scroll={{ y: "calc(100vh - 290px)" }}
        onRow={(r) => ({ onClick: () => { setDetail(r); setFocus({ kind: "transformer", id: r.id, label: r.name }); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "id" },
          { title: "容量 (kVA)", dataIndex: "capacity_kva", align: "right", sorter: (a, b) => a.capacity_kva - b.capacity_kva },
          { title: "型式", dataIndex: "trafo_type", render: (t) => <Tag>{t}式</Tag> },
          { title: "二次側額定", dataIndex: "lv_kv", render: (v: number) => lvLabel(v) },
          { title: "所屬 VCB", dataIndex: "vcb_name" },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", sorter: (a, b) => (a.load_ratio_percent ?? 0) - (b.load_ratio_percent ?? 0), render: (v) => <LoadRatioTag ratio={v} /> },
          { title: "連接建築", dataIndex: "connected_building_count", align: "right" },
        ]}
      />
      <Drawer width={480} open={!!detail} onClose={() => setDetail(null)} title={detail ? `變壓器:${detail.name}` : ""}>
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="容量">{detail.capacity_kva} kVA</Descriptions.Item>
              <Descriptions.Item label="型式">{detail.trafo_type}式</Descriptions.Item>
              <Descriptions.Item label="一次側額定">11.4 kV<span style={{ color: "#999", fontSize: 12 }}>(允許 {rangeKV(11.4)} kV)</span></Descriptions.Item>
              <Descriptions.Item label="二次側額定">{lvLabel(detail.lv_kv)}<span style={{ color: "#999", fontSize: 12 }}>(允許 {lvRangeLabel(detail.lv_kv)})</span></Descriptions.Item>
              <Descriptions.Item label="負載率">{detail.load_ratio_percent?.toFixed(1) ?? "—"}%</Descriptions.Item>
              <Descriptions.Item label="連接負載">{detail.total_connected_load_kw} kW</Descriptions.Item>
            </Descriptions>
            <List
              header={`連接建築（${detail.connected_building_count} 棟）`}
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
  const { setFocus } = useFocus();
  useEffect(() => { api.vcbs().then(setRows).catch((e) => message.error(String(e.message ?? e))); }, []);
  return (
    <Table<VcbDetail> rowKey="id" dataSource={rows} pagination={{ pageSize: 8 }} scroll={{ y: "calc(100vh - 290px)" }}
      onRow={(r) => ({ onClick: () => setFocus({ kind: "vcb", id: r.id, label: r.name }), style: { cursor: "pointer" } })}
      columns={[
        { title: "編號", dataIndex: "id" },
        { title: "名稱", dataIndex: "name" },
        { title: "饋線數", dataIndex: "feeder_count", align: "right" },
        { title: "變壓器數", dataIndex: "transformer_count", align: "right" },
        { title: "連接建築", dataIndex: "connected_building_count", align: "right" },
        { title: "連接負載 (kW)", dataIndex: "total_connected_load_kw", align: "right", sorter: (a, b) => a.total_connected_load_kw - b.total_connected_load_kw },
      ]}
    />
  );
}

function Feeders() {
  const [rows, setRows] = useState<FeederDetail[]>([]);
  const { setFocus } = useFocus();
  useEffect(() => { api.feeders().then(setRows).catch((e) => message.error(String(e.message ?? e))); }, []);
  return (
    <Table<FeederDetail> rowKey="id" dataSource={rows} pagination={{ pageSize: 8 }} scroll={{ y: "calc(100vh - 290px)" }}
      onRow={(r) => ({ onClick: () => setFocus({ kind: "feeder", id: r.id, label: r.name }), style: { cursor: "pointer" } })}
      columns={[
        { title: "編號", dataIndex: "id" },
        { title: "所屬 VCB", dataIndex: "vcb_name" },
        { title: "長度 (m)", dataIndex: "length_m", align: "right", render: (v: number) => v.toFixed(0), sorter: (a, b) => a.length_m - b.length_m },
        { title: "變壓器數", dataIndex: "transformer_count", align: "right" },
        { title: "負載率", dataIndex: "load_ratio_percent", align: "center", sorter: (a, b) => (a.load_ratio_percent ?? 0) - (b.load_ratio_percent ?? 0), render: (v) => <LoadRatioTag ratio={v} /> },
        { title: "連接建築", dataIndex: "connected_building_count", align: "right" },
      ]}
    />
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
  return (
    <>
      <Input.Search allowClear placeholder="搜尋 編號 / 建築物 / 迴路 / 廠牌" value={q}
        onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 8 }} />
      <Table<TransformerSpec>
        rowKey="seq" loading={loading} dataSource={filtered} size="small"
        pagination={{ pageSize: 8 }} scroll={{ y: "calc(100vh - 330px)" }}
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
      <Table<TransformerRisk>
        rowKey="tag" loading={loading} dataSource={rows} size="small"
        pagination={{ pageSize: 10 }} scroll={{ y: "calc(100vh - 330px)" }}
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

export default function AssetExplorer() {
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
      <Tabs
        items={[
          { key: "tr", label: "變壓器", children: <Transformers /> },
          { key: "replace", label: "汰換優先序", children: <Replacement /> },
          { key: "spec", label: "規格明細", children: <Specs /> },
          { key: "vcb", label: "VCB", children: <Vcbs /> },
          { key: "fd", label: "饋線", children: <Feeders /> },
        ]}
      />
    </Card>
  );
}
