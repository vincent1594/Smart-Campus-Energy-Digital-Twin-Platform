import { Button, Descriptions, Empty, Space, Steps, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { BuildingDetail, FeederDetail, TransformerDetail, VcbDetail } from "../api/types";
import LoadRatioTag from "./LoadRatioTag";
import type { SelectedNode } from "./TopologyFlow";

const kindLabel: Record<string, string> = {
  source: "台電進線", vcb: "VCB", feeder: "饋線", transformer: "變壓器", building: "建築",
};

export default function DeviceDetail({ selected }: { selected: SelectedNode | null }) {
  const navigate = useNavigate();
  const [tr, setTr] = useState<TransformerDetail | null>(null);
  const [bd, setBd] = useState<BuildingDetail | null>(null);
  const [vcb, setVcb] = useState<VcbDetail | null>(null);
  const [fd, setFd] = useState<FeederDetail | null>(null);

  useEffect(() => {
    setTr(null); setBd(null); setVcb(null); setFd(null);
    if (!selected) return;
    if (selected.kind === "transformer") api.transformer(selected.id).then(setTr).catch(() => {});
    else if (selected.kind === "building") api.building(selected.id).then(setBd).catch(() => {});
    else if (selected.kind === "vcb") api.vcbs().then((vs) => setVcb(vs.find((v) => v.id === selected.id) ?? null));
    else if (selected.kind === "feeder") api.feeders().then((fs) => setFd(fs.find((f) => f.id === selected.id) ?? null));
  }, [selected]);

  if (!selected || selected.kind === "source")
    return <Empty description="點擊左側拓樸節點查看設備詳細資訊" style={{ paddingTop: 60 }} />;

  if (tr)
    return (
      <>
        <Descriptions title={`變壓器 ${tr.name}`} bordered column={1} size="small">
          <Descriptions.Item label="設備類型">{kindLabel.transformer}</Descriptions.Item>
          <Descriptions.Item label="所屬饋線">{tr.feeder_name ?? <Tag>開關耦合</Tag>}</Descriptions.Item>
          <Descriptions.Item label="所屬 VCB">{tr.vcb_name}</Descriptions.Item>
          <Descriptions.Item label="容量">{tr.capacity_kva} kVA</Descriptions.Item>
          <Descriptions.Item label="一次側電壓">11.4 kV</Descriptions.Item>
          <Descriptions.Item label="二次側電壓">{tr.lv_kv === 0.38 ? "380/220 V" : `${tr.lv_kv * 1000} V`}</Descriptions.Item>
          <Descriptions.Item label="型式">{tr.trafo_type}式</Descriptions.Item>
          <Descriptions.Item label="負載率"><LoadRatioTag ratio={tr.load_ratio_percent} /></Descriptions.Item>
          <Descriptions.Item label="連接建築">{tr.connected_building_count} 棟 / {tr.total_connected_load_kw} kW</Descriptions.Item>
          <Descriptions.Item label="運轉狀態">
            {tr.load_ratio_percent != null && tr.load_ratio_percent > 100
              ? <Tag color="red">過載</Tag> : <Tag color="green">正常</Tag>}
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate("/scenario")}>規劃模擬</Button>
        </Space>
      </>
    );

  if (bd)
    return (
      <>
        <Descriptions title={`建築 ${bd.name}`} bordered column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="編號">{bd.id}</Descriptions.Item>
          <Descriptions.Item label="估計負載">{bd.estimated_load_kw} kW</Descriptions.Item>
          <Descriptions.Item label="功率因數">{bd.power_factor}</Descriptions.Item>
          <Descriptions.Item label="所屬變壓器">{bd.transformer_name}（{bd.transformer_capacity_kva} kVA）</Descriptions.Item>
          <Descriptions.Item label="所屬饋線">{bd.feeder_name ?? <Tag>開關耦合</Tag>}</Descriptions.Item>
          <Descriptions.Item label="所屬 VCB">{bd.vcb_name}</Descriptions.Item>
        </Descriptions>
        <b>供電路徑</b>
        <Steps direction="vertical" size="small" current={bd.supply_path.length - 1}
          items={bd.supply_path.map((n) => ({ title: n.name, description: kindLabel[n.kind] ?? n.kind }))} />
      </>
    );

  if (vcb)
    return (
      <Descriptions title={`VCB ${vcb.name}`} bordered column={1} size="small">
        <Descriptions.Item label="饋線數">{vcb.feeder_count}</Descriptions.Item>
        <Descriptions.Item label="變壓器數">{vcb.transformer_count}</Descriptions.Item>
        <Descriptions.Item label="連接建築">{vcb.connected_building_count} 棟</Descriptions.Item>
        <Descriptions.Item label="連接負載">{vcb.total_connected_load_kw} kW</Descriptions.Item>
      </Descriptions>
    );

  if (fd)
    return (
      <Descriptions title={`饋線 ${fd.name}`} bordered column={1} size="small">
        <Descriptions.Item label="所屬 VCB">{fd.vcb_name}</Descriptions.Item>
        <Descriptions.Item label="長度">{fd.length_m.toFixed(0)} m</Descriptions.Item>
        <Descriptions.Item label="變壓器數">{fd.transformer_count}</Descriptions.Item>
        <Descriptions.Item label="負載率"><LoadRatioTag ratio={fd.load_ratio_percent} /></Descriptions.Item>
        <Descriptions.Item label="連接建築">{fd.connected_building_count} 棟 / {fd.total_connected_load_kw} kW</Descriptions.Item>
      </Descriptions>
    );

  return <Empty description="載入中…" style={{ paddingTop: 60 }} />;
}
