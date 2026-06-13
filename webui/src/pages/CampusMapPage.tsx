import { Button, Card, Col, Empty, List, Modal, Row, Space, Spin, Statistic, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, TransformerDetail } from "../api/types";
import CampusMapStatic, { type MapMarker } from "../components/CampusMapStatic";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";
import { BUILDING_POS, type Pt, buildingLetter } from "../lib/campusPositions";

interface Zone { letter: string; name: string; totalLoad: number; maxRatio: number | null; buildings: BuildingSummary[]; trafoNames: Set<string>; }

export default function CampusMapPage() {
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);
  const [polys, setPolys] = useState<Record<string, Pt[]>>(() => JSON.parse(JSON.stringify(BUILDING_POS)));
  const [exportOpen, setExportOpen] = useState(false);
  const { setFocus } = useFocus();

  useEffect(() => { api.buildings().then(setBuildings); api.transformers().then(setTrafos); }, []);

  const ratioByTrafoName = useMemo(() => new Map(trafos.map((t) => [t.name, t.load_ratio_percent])), [trafos]);

  const zones = useMemo(() => {
    const map = new Map<string, Zone>();
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      if (!map.has(L)) map.set(L, { letter: L, name: b.name, totalLoad: 0, maxRatio: null, buildings: [], trafoNames: new Set() });
      const z = map.get(L)!;
      z.totalLoad += b.estimated_load_kw; z.buildings.push(b); z.trafoNames.add(b.transformer_name);
      const r = ratioByTrafoName.get(b.transformer_name);
      if (r != null) z.maxRatio = Math.max(z.maxRatio ?? 0, r);
    }
    return map;
  }, [buildings, ratioByTrafoName]);

  const markers: MapMarker[] = useMemo(() => [
    { letter: "X", name: "受電站(X棟)", ratio: null },
    ...[...zones.values()].map((z) => ({ letter: z.letter, name: z.name.replace(/\s*\(.*\)/, ""), ratio: z.maxRatio })),
  ], [zones]);

  const zone = sel ? zones.get(sel) : null;
  const zoneTrafos = zone ? trafos.filter((t) => zone.trafoNames.has(t.name)) : [];

  if (!buildings.length) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <Row gutter={12} style={{ height: "100%" }}>
      <Col xs={24} lg={17} style={{ height: "100%" }}>
        <Card size="small" title="校園供電地圖" style={{ height: "100%" }}
          styles={{ body: { padding: 8, height: "calc(100% - 39px)", display: "flex", flexDirection: "column" } }}
          extra={
            <Space>
              <span style={{ fontSize: 12 }}>編輯位置/大小</span>
              <Switch size="small" checked={editable} onChange={setEditable} />
              {editable && <Button size="small" type="primary" onClick={() => setExportOpen(true)}>匯出座標</Button>}
            </Space>
          }>
          <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
            <CampusMapStatic
              markers={markers} polys={polys} fitHeight
              editable={editable}
              onPolyChange={(letter, pts) => setPolys((p) => ({ ...p, [letter]: pts }))}
              onSelect={(L) => { setSel(L); const z = zones.get(L); if (z?.buildings[0]) setFocus({ kind: "building", id: z.buildings[0].id, label: z.name.replace(/\s*\(.*\)/, "") }); }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#999" }}>
            {editable ? "拖頂點移動、雙擊邊加頂點、雙擊頂點刪除 → 完成按「匯出座標」貼回給我" : "點棟別查看該區設備;右上開「編輯」可拉成不規則形狀"}
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={7} style={{ height: "100%" }}>
        <Card title={zone ? `${zone.letter}棟 區域` : "區域詳情"} size="small" style={{ height: "100%" }} styles={{ body: { height: "calc(100% - 39px)", overflow: "auto" } }}>
          {!zone ? <Empty description="點地圖上的棟別" style={{ paddingTop: 60 }} /> : (
            <>
              <Row gutter={8}>
                <Col span={12}><Statistic title="區域總負載" value={zone.totalLoad} precision={1} suffix="kW" /></Col>
                <Col span={12}><Statistic title="最高負載率" value={zone.maxRatio ?? 0} precision={1} suffix="%" /></Col>
              </Row>
              <List size="small" header={<b>變壓器</b>} dataSource={zoneTrafos}
                renderItem={(t) => <List.Item><span>{t.name}（{t.capacity_kva} kVA）</span><LoadRatioTag ratio={t.load_ratio_percent} /></List.Item>} />
              <List size="small" header={<b>建築</b>} dataSource={zone.buildings}
                renderItem={(b) => <List.Item><span>{b.name}</span><span>{b.estimated_load_kw} kW</span></List.Item>} />
            </>
          )}
        </Card>
      </Col>

      <Modal title="匯出座標 — 貼回給我或 src/lib/campusPositions.ts 的 BUILDING_POS" open={exportOpen} footer={null} onCancel={() => setExportOpen(false)} width={520}>
        <Typography.Paragraph copyable={{ text: JSON.stringify(polys, null, 2) }}>
          <pre style={{ maxHeight: 380, overflow: "auto" }}>{JSON.stringify(polys, null, 2)}</pre>
        </Typography.Paragraph>
      </Modal>
    </Row>
  );
}
