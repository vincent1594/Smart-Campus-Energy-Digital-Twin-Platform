import { DownloadOutlined } from "@ant-design/icons";
import { Button, Card, List, Tag, message } from "antd";
import { useState } from "react";
import { api } from "../api/client";
import { downloadCSV, stamp } from "../lib/csv";
import { lvLabel, lvRangeLabel } from "../lib/voltage";

interface ReportDef {
  key: string;
  title: string;
  desc: string;
  run: () => Promise<number>; // 回傳匯出筆數
}

const REPORTS: ReportDef[] = [
  {
    key: "transformers",
    title: "變壓器清單",
    desc: "編號、容量、型式、二次側額定與容許範圍、所屬 VCB/饋線、負載率、連接建築與負載。",
    run: async () => {
      const rows = await api.transformers();
      downloadCSV(`變壓器清單_${stamp()}.csv`, rows, [
        { label: "編號", value: (r) => r.id },
        { label: "名稱", value: (r) => r.name },
        { label: "容量(kVA)", value: (r) => r.capacity_kva },
        { label: "型式", value: (r) => `${r.trafo_type}式` },
        { label: "二次側額定", value: (r) => lvLabel(r.lv_kv) },
        { label: "二次側容許範圍(±10%)", value: (r) => lvRangeLabel(r.lv_kv) },
        { label: "所屬VCB", value: (r) => r.vcb_name },
        { label: "所屬饋線", value: (r) => r.feeder_name ?? "" },
        { label: "負載率(%)", value: (r) => r.load_ratio_percent ?? "" },
        { label: "連接建築數", value: (r) => r.connected_building_count },
        { label: "連接負載(kW)", value: (r) => r.total_connected_load_kw },
      ]);
      return rows.length;
    },
  },
  {
    key: "specs",
    title: "變壓器規格明細(原始)",
    desc: "各站變壓器銘牌/實測規格:廠牌、年份、迴路、實際電壓、負載電流、功因、電容器等(供核對)。",
    run: async () => {
      const rows = await api.transformerSpecs();
      downloadCSV(`變壓器規格明細_${stamp()}.csv`, rows, [
        { label: "序號", value: (r) => r.seq },
        { label: "建築物", value: (r) => r.building },
        { label: "變壓器編號", value: (r) => r.tag },
        { label: "廠牌", value: (r) => r.brand },
        { label: "製造年份", value: (r) => r.year },
        { label: "容量(kVA)", value: (r) => r.capacity_kva ?? "" },
        { label: "型式", value: (r) => r.trafo_type },
        { label: "迴路名稱", value: (r) => r.circuit },
        { label: "負載概述", value: (r) => r.load_desc },
        { label: "一次側額定電壓(kV)", value: (r) => r.hv_kv },
        { label: "二次側額定電壓(V)", value: (r) => r.lv_v },
        { label: "一次側實際電壓(kV)", value: (r) => r.hv_actual_kv },
        { label: "二次側實際電壓(V)", value: (r) => r.lv_actual_v },
        { label: "負載電流(A)", value: (r) => r.load_current_a ?? "" },
        { label: "功因", value: (r) => r.power_factor ?? "" },
        { label: "平均負載(kW)", value: (r) => r.avg_load_kw ?? "" },
        { label: "負載率(%)", value: (r) => r.load_ratio_percent ?? "" },
        { label: "效率", value: (r) => r.efficiency ?? "" },
        { label: "溫度(°C)", value: (r) => r.temperature_c ?? "" },
        { label: "功因自動調整器", value: (r) => r.pf_regulator },
        { label: "裝置電容器量(kVAr)", value: (r) => r.capacitor_kvar ?? "" },
      ]);
      return rows.length;
    },
  },
  {
    key: "buildings",
    title: "建築清單",
    desc: "各棟估計負載、所屬變壓器與饋線。",
    run: async () => {
      const rows = await api.buildings();
      downloadCSV(`建築清單_${stamp()}.csv`, rows, [
        { label: "編號", value: (r) => r.id },
        { label: "名稱", value: (r) => r.name },
        { label: "估計負載(kW)", value: (r) => r.estimated_load_kw },
        { label: "所屬變壓器", value: (r) => r.transformer_name },
        { label: "所屬饋線", value: (r) => r.feeder_name },
      ]);
      return rows.length;
    },
  },
  {
    key: "feeders",
    title: "饋線清單",
    desc: "各饋線所屬 VCB、長度、線徑、負載率、連接變壓器與建築。",
    run: async () => {
      const rows = await api.feeders();
      downloadCSV(`饋線清單_${stamp()}.csv`, rows, [
        { label: "編號", value: (r) => r.id },
        { label: "名稱", value: (r) => r.name },
        { label: "所屬VCB", value: (r) => r.vcb_name },
        { label: "長度(m)", value: (r) => r.length_m.toFixed(0) },
        { label: "線徑(mm²)", value: (r) => r.cross_section_mm2 ?? "" },
        { label: "負載率(%)", value: (r) => r.load_ratio_percent ?? "" },
        { label: "變壓器數", value: (r) => r.transformer_count },
        { label: "連接建築數", value: (r) => r.connected_building_count },
        { label: "連接負載(kW)", value: (r) => r.total_connected_load_kw },
      ]);
      return rows.length;
    },
  },
  {
    key: "alarms",
    title: "告警清單",
    desc: "現況潮流的越限項目:變壓器/饋線負載率 ≥80%、建築電壓偏低 <0.95pu。",
    run: async () => {
      const pf = await api.powerflow();
      const out: { level: string; type: string; equipment: string; message: string }[] = [];
      pf.transformer_loadings.filter((t) => t.load_ratio_percent >= 80).forEach((t) =>
        out.push({ level: t.load_ratio_percent > 100 ? "警告" : "注意", type: "變壓器", equipment: t.transformer_name, message: `負載率 ${t.load_ratio_percent.toFixed(1)}%（容量 ${t.capacity_kva} kVA）` }));
      pf.feeder_loadings.filter((f) => f.load_ratio_percent >= 80).forEach((f) =>
        out.push({ level: f.load_ratio_percent > 100 ? "警告" : "注意", type: "饋線", equipment: f.feeder_name, message: `負載率 ${f.load_ratio_percent.toFixed(1)}%` }));
      pf.building_voltages.filter((b) => b.voltage_pu < 0.95).forEach((b) =>
        out.push({ level: "注意", type: "建築", equipment: b.building_name, message: `電壓偏低 ${b.voltage_pu.toFixed(4)} pu` }));
      downloadCSV(`告警清單_${stamp()}.csv`, out, [
        { label: "等級", value: (r) => r.level },
        { label: "類型", value: (r) => r.type },
        { label: "設備", value: (r) => r.equipment },
        { label: "訊息", value: (r) => r.message },
      ]);
      return out.length;
    },
  },
  {
    key: "summary",
    title: "系統總覽摘要",
    desc: "全系統 KPI:總負載、無效功率、系統損耗、最低電壓、最大變壓器/饋線負載率、負載基準。",
    run: async () => {
      const d = await api.dashboard();
      const rows = [
        { item: "系統狀態", value: d.status },
        { item: "建築數", value: `${d.building_count} 棟` },
        { item: "變壓器數", value: `${d.transformer_count} 台` },
        { item: "饋線數", value: `${d.feeder_count} 條` },
        { item: "VCB 數", value: `${d.vcb_count} 路` },
        { item: "總負載", value: `${d.total_load_kw} kW / ${d.total_load_kvar} kVAR` },
        { item: "系統損耗", value: `${d.system_loss_kw} kW / ${d.system_loss_kvar} kVAR` },
        { item: "最低電壓", value: `${d.min_voltage_pu} pu` },
        { item: "最大變壓器負載率", value: `${d.max_transformer_load_ratio_percent} %` },
        { item: "最大饋線負載率", value: `${d.max_feeder_load_ratio_percent} %` },
        { item: "負載基準", value: d.load_basis ?? "" },
      ];
      downloadCSV(`系統總覽摘要_${stamp()}.csv`, rows, [
        { label: "項目", value: (r) => r.item },
        { label: "數值", value: (r) => r.value },
      ]);
      return rows.length;
    },
  },
];

export default function Report() {
  const [busy, setBusy] = useState<string | null>(null);

  const handle = async (r: ReportDef) => {
    setBusy(r.key);
    try {
      const n = await r.run();
      message.success(`已匯出「${r.title}」(${n} 筆)`);
    } catch (e) {
      message.error(`匯出失敗:${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="報表匯出" size="small" style={{ height: "100%", display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, overflow: "auto" } }}
      extra={<span style={{ color: "#999", fontSize: 12 }}>匯出 CSV(UTF-8,Excel 可直接開啟)· 取目前現況快照</span>}>
      <List
        dataSource={REPORTS}
        renderItem={(r) => (
          <List.Item
            actions={[
              <Button key="dl" type="primary" icon={<DownloadOutlined />} loading={busy === r.key} onClick={() => handle(r)}>
                匯出 CSV
              </Button>,
            ]}>
            <List.Item.Meta
              title={<span>{r.title} <Tag color="blue">CSV</Tag></span>}
              description={r.desc}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
