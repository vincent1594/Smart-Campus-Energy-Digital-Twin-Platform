import { useMemo } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import type { PowerFlowResult, TopologyGraph } from "../api/types";
import { buildFlow } from "../lib/topology";

export interface SelectedNode {
  kind: string;
  id: string;
}

export default function TopologyFlow({
  graph,
  pf,
  onSelect,
  height = 480,
}: {
  graph: TopologyGraph;
  pf?: PowerFlowResult;
  onSelect?: (n: SelectedNode) => void;
  height?: number | string;
}) {
  const { nodes, edges } = useMemo(() => buildFlow(graph, pf), [graph, pf]);

  return (
    <div style={{ height, border: "1px solid #f0f0f0", borderRadius: 8 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelect?.({ kind: (node.data as { kind: string }).kind, id: node.id })}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#eee" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
