"""配電拓樸與供電路徑 (用 NetworkX)。

階層:SOURCE(台電) -> VCB -> Feeder(HV電纜) -> Transformer -> Building
部分變壓器以母線開關直接耦合 (feeder_id 為 None),此時 VCB 直接接 Transformer。
"""
from __future__ import annotations

import networkx as nx

from webapi.domain import CampusModel
from webapi.schemas import SupplyPathNode

SOURCE_ID = "SOURCE"


def build_graph(model: CampusModel) -> nx.DiGraph:
    g = nx.DiGraph()
    g.add_node(SOURCE_ID, kind="source", name=model.source_name)

    for vcb in model.vcbs:
        g.add_node(vcb.id, kind="vcb", name=vcb.name)
        g.add_edge(SOURCE_ID, vcb.id)

    for f in model.feeders:
        g.add_node(f.id, kind="feeder", name=f.name)
        g.add_edge(f.vcb_id, f.id)

    for t in model.transformers:
        g.add_node(t.id, kind="transformer", name=t.name)
        parent = t.feeder_id if (t.feeder_id and g.has_node(t.feeder_id)) else t.vcb_id
        g.add_edge(parent, t.id)

    for b in model.buildings:
        g.add_node(b.id, kind="building", name=b.name)
        g.add_edge(b.transformer_id, b.id)

    return g


def supply_path(model: CampusModel, building_id: str) -> list[SupplyPathNode]:
    g = build_graph(model)
    if building_id not in g:
        return []
    path_ids = nx.shortest_path(g, SOURCE_ID, building_id)
    return [
        SupplyPathNode(kind=g.nodes[n]["kind"], id=str(n), name=g.nodes[n]["name"])
        for n in path_ids
    ]


def building_ancestors(model: CampusModel, building_id: str) -> dict[str, str]:
    """回傳建築所屬 {transformer, feeder, vcb} 的 id (feeder 可能為空字串)。"""
    b = model.building(building_id)
    if b is None:
        return {}
    tr = model.transformer(b.transformer_id)
    if tr is None:
        return {}
    return {
        "transformer": tr.id,
        "feeder": tr.feeder_id or "",
        "vcb": tr.vcb_id,
    }
