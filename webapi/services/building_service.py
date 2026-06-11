"""Building Explorer:搜尋建築、顯示所屬設備與供電路徑。"""
from __future__ import annotations

from typing import Optional

from webapi import state
from webapi import topology
from webapi.schemas import BuildingDetail, BuildingSummary


def list_buildings(query: Optional[str] = None) -> list[BuildingSummary]:
    model = state.get_base_model()
    q = (query or "").strip()
    items: list[BuildingSummary] = []
    for b in model.buildings:
        if q and q not in b.name and q not in b.id:
            continue
        tr = model.transformer(b.transformer_id)
        feeder = model.feeder(tr.feeder_id) if (tr and tr.feeder_id) else None
        items.append(BuildingSummary(
            id=b.id, name=b.name, estimated_load_kw=b.load_kw,
            feeder_name=feeder.name if feeder else "(開關耦合)",
            transformer_name=tr.name if tr else "",
        ))
    return items


def get_building(building_id: str) -> Optional[BuildingDetail]:
    model = state.get_base_model()
    b = model.building(building_id)
    if b is None:
        return None

    anc = topology.building_ancestors(model, building_id)
    tr = model.transformer(anc.get("transformer", ""))
    feeder = model.feeder(anc.get("feeder", "")) if anc.get("feeder") else None
    vcb = model.vcb(anc.get("vcb", ""))

    return BuildingDetail(
        id=b.id, name=b.name,
        estimated_load_kw=b.load_kw, power_factor=b.power_factor,
        vcb_id=vcb.id if vcb else "", vcb_name=vcb.name if vcb else "",
        feeder_id=feeder.id if feeder else None,
        feeder_name=feeder.name if feeder else None,
        transformer_id=tr.id if tr else "", transformer_name=tr.name if tr else "",
        transformer_capacity_kva=tr.capacity_kva if tr else 0.0,
        supply_path=_enriched_path(model, building_id),
    )


def _enriched_path(model, building_id: str):
    """供電路徑節點補上:饋線長度/線徑/負載率、變壓器容量/負載率。"""
    result = state.get_base_result()
    feeder_ratio = {f.feeder_id: f.load_ratio_percent for f in result.feeder_loadings}
    trafo_ratio = {t.transformer_id: t.load_ratio_percent for t in result.transformer_loadings}
    nodes = topology.supply_path(model, building_id)
    for n in nodes:
        if n.kind == "feeder":
            f = model.feeder(n.id)
            if f:
                n.length_m = f.length_m
                n.cross_section_mm2 = f.cross_section_mm2
            n.load_ratio_percent = feeder_ratio.get(n.id)
        elif n.kind == "transformer":
            tr = model.transformer(n.id)
            if tr:
                n.capacity_kva = tr.capacity_kva
            n.load_ratio_percent = trafo_ratio.get(n.id)
    return nodes
