"""Topology Viewer:回傳 React Flow 用的 nodes / edges。"""
from __future__ import annotations

from webapi import state
from webapi import topology
from webapi.schemas import TopologyEdge, TopologyGraph, TopologyNode


def get_graph() -> TopologyGraph:
    model = state.get_base_model()
    g = topology.build_graph(model)

    nodes = [
        TopologyNode(id=n, kind=g.nodes[n]["kind"], label=g.nodes[n]["name"])
        for n in g.nodes
    ]
    edges = [
        TopologyEdge(id=f"{u}->{v}", source=u, target=v)
        for u, v in g.edges
    ]
    return TopologyGraph(nodes=nodes, edges=edges)
