import { Button, Modal, Space, Switch, Typography } from "antd";
import { useMemo, useState } from "react";
import ReactFlow, { Controls, type Node, type NodeProps, type NodeTypes } from "reactflow";
import "reactflow/dist/style.css";
import { BUILDING_POS, MAP_H, MAP_IMAGE, MAP_W, ratioColor } from "../lib/campusPositions";

export interface MapMarker {
  letter: string;
  name: string;
  ratio: number | null;
}

function MapBgNode() {
  return (
    <div style={{ width: MAP_W, height: MAP_H, backgroundImage: `url(${MAP_IMAGE})`, backgroundSize: "100% 100%" }} />
  );
}

function MarkerNode({ data }: NodeProps) {
  const d = data as { letter: string; name: string; ratio: number | null; bg: string; border: string };
  return (
    <div title={`${d.letter}棟 ${d.name}${d.ratio != null ? `｜負載率 ${d.ratio.toFixed(0)}%` : ""}`}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 40, height: 40, borderRadius: "50%", fontWeight: 700, fontSize: 15,
        color: "#fff", background: d.bg, border: `3px solid ${d.border}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)", cursor: "pointer",
      }}>
      {d.letter}
    </div>
  );
}

const nodeTypes: NodeTypes = { mapbg: MapBgNode, marker: MarkerNode };

export default function CampusMap({
  markers,
  onSelect,
  height = 640,
}: {
  markers: MapMarker[];
  onSelect?: (letter: string) => void;
  height?: number;
}) {
  const [editable, setEditable] = useState(false);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(BUILDING_POS);
  const [exportOpen, setExportOpen] = useState(false);

  const nodes: Node[] = useMemo(() => {
    const bg: Node = {
      id: "_map", type: "mapbg", position: { x: 0, y: 0 }, data: {},
      draggable: false, selectable: false, zIndex: 0,
    };
    const ms: Node[] = markers
      .filter((m) => pos[m.letter])
      .map((m) => {
        const c = ratioColor(m.ratio);
        return {
          id: m.letter, type: "marker",
          position: pos[m.letter],
          data: { ...m, bg: c.bg, border: c.border },
          draggable: editable, zIndex: 10,
        };
      });
    return [bg, ...ms];
  }, [markers, pos, editable]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 20 }}>
        <Space>
          <span>編輯位置</span>
          <Switch size="small" checked={editable} onChange={setEditable} />
          {editable && <Button size="small" onClick={() => setExportOpen(true)}>匯出座標</Button>}
        </Space>
      </div>
      <div style={{ height, border: "1px solid #f0f0f0", borderRadius: 8 }}>
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.05}
          nodesConnectable={false}
          onNodeClick={(_, n) => n.type === "marker" && onSelect?.(n.id)}
          onNodeDragStop={(_, n) =>
            setPos((p) => ({ ...p, [n.id]: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }))
          }
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <Modal title="匯出座標 — 貼回 src/lib/campusPositions.ts 的 BUILDING_POS" open={exportOpen} footer={null} onCancel={() => setExportOpen(false)} width={520}>
        <Typography.Paragraph copyable={{ text: JSON.stringify(pos, null, 2) }}>
          <pre style={{ maxHeight: 360, overflow: "auto" }}>{JSON.stringify(pos, null, 2)}</pre>
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
