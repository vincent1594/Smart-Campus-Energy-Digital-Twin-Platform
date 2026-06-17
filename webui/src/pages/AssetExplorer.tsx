import { Card, Descriptions, Drawer, Input, List, Table, Tabs, Tag, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { FeederDetail, TransformerDetail, TransformerSpec, VcbDetail } from "../api/types";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";
import { lvLabel, lvRangeLabel, rangeKV } from "../lib/voltage";

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

export default function AssetExplorer() {
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
      <Tabs
        items={[
          { key: "tr", label: "變壓器", children: <Transformers /> },
          { key: "spec", label: "規格明細", children: <Specs /> },
          { key: "vcb", label: "VCB", children: <Vcbs /> },
          { key: "fd", label: "饋線", children: <Feeders /> },
        ]}
      />
    </Card>
  );
}
