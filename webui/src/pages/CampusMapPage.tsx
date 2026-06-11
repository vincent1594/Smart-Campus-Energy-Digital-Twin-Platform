import { Card, Col, Empty, List, Row, Spin, Statistic, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BuildingSummary, TransformerDetail } from "../api/types";
import CampusMap, { type MapMarker } from "../components/CampusMap";
import LoadRatioTag from "../components/LoadRatioTag";
import { useFocus } from "../focus/FocusContext";
import { buildingLetter } from "../lib/campusPositions";

interface Zone {
  letter: string;
  name: string;
  totalLoad: number;
  maxRatio: number | null;
  buildings: BuildingSummary[];
  trafoNames: Set<string>;
}

export default function CampusMapPage() {
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [trafos, setTrafos] = useState<TransformerDetail[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const { setFocus } = useFocus();

  useEffect(() => {
    api.buildings().then(setBuildings);
    api.transformers().then(setTrafos);
  }, []);

  const ratioByTrafoName = useMemo(
    () => new Map(trafos.map((t) => [t.name, t.load_ratio_percent])),
    [trafos]
  );

  const zones = useMemo(() => {
    const map = new Map<string, Zone>();
    for (const b of buildings) {
      const L = buildingLetter(b.id);
      if (!map.has(L)) map.set(L, { letter: L, name: b.name, totalLoad: 0, maxRatio: null, buildings: [], trafoNames: new Set() });
      const z = map.get(L)!;
      z.totalLoad += b.estimated_load_kw;
      z.buildings.push(b);
      z.trafoNames.add(b.transformer_name);
      const r = ratioByTrafoName.get(b.transformer_name);
      if (r != null) z.maxRatio = Math.max(z.maxRatio ?? 0, r);
    }
    return map;
  }, [buildings, ratioByTrafoName]);

  const markers: MapMarker[] = useMemo(
    () => [
      { letter: "X", name: "受電站(X棟)", ratio: null }, // 可拖曳校正受電站位置
      ...[...zones.values()].map((z) => ({ letter: z.letter, name: z.name.replace(/\s*\(.*\)/, ""), ratio: z.maxRatio })),
    ],
    [zones]
  );

  const zone = sel ? zones.get(sel) : null;
  const zoneTrafos = zone ? trafos.filter((t) => zone.trafoNames.has(t.name)) : [];

  if (!buildings.length) return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  return (
    <Row gutter={12}>
      <Col xs={24} lg={17}>
        <Card title="校園供電地圖（點棟別查看該區設備；右上可開「編輯位置」校正座標）" size="small" styles={{ body: { padding: 8 } }}>
          <CampusMap markers={markers} onSelect={(L) => { setSel(L); const z = zones.get(L); if (z?.buildings[0]) setFocus({ kind: "building", id: z.buildings[0].id, label: z.name.replace(/\s*\(.*\)/, "") }); }} height={680} />
          <div style={{ marginTop: 8 }}>
            <Tag color="#52c41a">0–50%</Tag><Tag color="#fadb14">50–80%</Tag>
            <Tag color="#fa8c16">80–100%</Tag><Tag color="#ff4d4f">&gt;100%</Tag>
            <span style={{ color: "#999" }}>圓點顏色 = 該區變壓器最高負載率</span>
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={7}>
        <Card title={zone ? `${zone.letter}棟 區域` : "區域詳情"} size="small" style={{ height: "100%" }}>
          {!zone ? (
            <Empty description="點地圖上的棟別" style={{ paddingTop: 60 }} />
          ) : (
            <>
              <Row gutter={8}>
                <Col span={12}><Statistic title="區域總負載" value={zone.totalLoad} precision={1} suffix="kW" /></Col>
                <Col span={12}><Statistic title="最高負載率" value={zone.maxRatio ?? 0} precision={1} suffix="%" /></Col>
              </Row>
              <List size="small" header={<b>變壓器</b>} dataSource={zoneTrafos}
                renderItem={(t) => (
                  <List.Item>
                    <span>{t.name}（{t.capacity_kva} kVA）</span>
                    <LoadRatioTag ratio={t.load_ratio_percent} />
                  </List.Item>
                )} />
              <List size="small" header={<b>建築</b>} dataSource={zone.buildings}
                renderItem={(b) => (
                  <List.Item>
                    <span>{b.name}</span>
                    <span>{b.estimated_load_kw} kW</span>
                  </List.Item>
                )} />
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}
