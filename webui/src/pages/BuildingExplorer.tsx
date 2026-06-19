import { Card, Descriptions, Drawer, Input, Steps, Table, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BuildingDetail, BuildingSummary } from "../api/types";
import { useFocus } from "../focus/FocusContext";
import { useFillHeight } from "../lib/useFillHeight";

const kindLabel: Record<string, string> = {
  source: "台電進線",
  vcb: "VCB",
  feeder: "饋線",
  transformer: "變壓器",
  building: "建築",
};

// 建築查詢內容(搜尋+表格+詳情抽屜),無外層 Card。供設備查詢分頁與獨立頁共用。
export function BuildingsPanel() {
  const [rows, setRows] = useState<BuildingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<BuildingDetail | null>(null);
  const { setFocus } = useFocus();
  const fh = useFillHeight();

  const load = (query?: string) => {
    setLoading(true);
    api.buildings(query).then(setRows).catch((e) => message.error(String(e.message ?? e))).finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  const openDetail = (id: string) => {
    api.building(id).then(setDetail).catch((e) => message.error(String(e.message ?? e)));
  };

  return (
    <>
      <Input.Search
        placeholder="輸入建築名稱或編號 (例如 LOAD_T)"
        allowClear
        enterButton="搜尋"
        size="small"
        style={{ maxWidth: 420, marginBottom: 8 }}
        onSearch={(v) => load(v)}
      />
      <div ref={fh.ref}>
      <Table<BuildingSummary>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ y: fh.height }}
        onRow={(r) => ({ onClick: () => { openDetail(r.id); setFocus({ kind: "building", id: r.id, label: r.name }); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "編號", dataIndex: "id", width: 120 },
          { title: "建築", dataIndex: "name" },
          {
            title: "樓地板面積 (m²)", dataIndex: "floor_area_m2", align: "right",
            sorter: (a, b) => (a.floor_area_m2 ?? 0) - (b.floor_area_m2 ?? 0),
            render: (v: number | null) => (v != null ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"),
          },
          { title: "估計負載 (kW)", dataIndex: "estimated_load_kw", align: "right", sorter: (a, b) => a.estimated_load_kw - b.estimated_load_kw },
          { title: "所屬饋線", dataIndex: "feeder_name" },
          { title: "所屬變壓器", dataIndex: "transformer_name" },
        ]}
      />
      </div>

      <Drawer width={560} open={!!detail} onClose={() => setDetail(null)} title={detail ? `建築:${detail.name}` : ""}>
        {detail && (
          <>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="編號">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="估計負載">{detail.estimated_load_kw} kW</Descriptions.Item>
              <Descriptions.Item label="功率因數">{detail.power_factor}</Descriptions.Item>
              <Descriptions.Item label="所屬 VCB">{detail.vcb_name}</Descriptions.Item>
              <Descriptions.Item label="所屬饋線">{detail.feeder_name ?? <Tag>開關耦合</Tag>}</Descriptions.Item>
              <Descriptions.Item label="所屬變壓器">{detail.transformer_name}</Descriptions.Item>
              <Descriptions.Item label="變壓器容量">{detail.transformer_capacity_kva} kVA</Descriptions.Item>
            </Descriptions>

            <h4>供電路徑</h4>
            <Steps
              direction="vertical"
              size="small"
              current={detail.supply_path.length - 1}
              items={detail.supply_path.map((n) => ({
                title: n.name,
                description: kindLabel[n.kind] ?? n.kind,
              }))}
            />
          </>
        )}
      </Drawer>
    </>
  );
}

export default function BuildingExplorer() {
  return (
    <Card style={{ height: "100%", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}>
      <BuildingsPanel />
    </Card>
  );
}
