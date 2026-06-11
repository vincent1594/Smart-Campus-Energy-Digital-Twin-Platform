import { Card, Drawer, List, Table, Tabs, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { FeederDetail, TransformerDetail, VcbDetail } from "../api/types";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";

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
        rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 12 }}
        onRow={(r) => ({ onClick: () => { setDetail(r); setFocus({ kind: "transformer", id: r.id, label: r.name }); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "id" },
          { title: "容量 (kVA)", dataIndex: "capacity_kva", align: "right", sorter: (a, b) => a.capacity_kva - b.capacity_kva },
          { title: "型式", dataIndex: "trafo_type", render: (t) => <Tag>{t}式</Tag> },
          { title: "所屬 VCB", dataIndex: "vcb_name" },
          { title: "負載率", dataIndex: "load_ratio_percent", align: "center", sorter: (a, b) => (a.load_ratio_percent ?? 0) - (b.load_ratio_percent ?? 0), render: (v) => <LoadRatioTag ratio={v} /> },
          { title: "連接建築", dataIndex: "connected_building_count", align: "right" },
        ]}
      />
      <Drawer width={480} open={!!detail} onClose={() => setDetail(null)} title={detail ? `變壓器:${detail.name}` : ""}>
        {detail && (
          <List
            header={`容量 ${detail.capacity_kva} kVA ｜ 負載率 ${detail.load_ratio_percent?.toFixed(1) ?? "—"}% ｜ 連接負載 ${detail.total_connected_load_kw} kW`}
            size="small" bordered dataSource={detail.connected_buildings}
            renderItem={(b) => <List.Item>{b}</List.Item>}
          />
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
    <Table<VcbDetail> rowKey="id" dataSource={rows} pagination={false}
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
    <Table<FeederDetail> rowKey="id" dataSource={rows} pagination={{ pageSize: 12 }}
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

export default function AssetExplorer() {
  return (
    <Card>
      <Tabs
        items={[
          { key: "tr", label: "變壓器", children: <Transformers /> },
          { key: "vcb", label: "VCB", children: <Vcbs /> },
          { key: "fd", label: "饋線", children: <Feeders /> },
        ]}
      />
    </Card>
  );
}
