"""Asset Explorer:查詢變壓器 / VCB / 饋線,含容量、連接建築、負載率。

負載率取自已快取的 base 潮流結果;容量、連接關係取自 domain model。
"""
from __future__ import annotations

from typing import Optional

from webapi import state
from webapi.schemas import FeederDetail, TransformerDetail, VcbDetail


def _trafo_ratio(transformer_id: str) -> Optional[float]:
    result = state.get_base_result()
    return next((t.load_ratio_percent for t in result.transformer_loadings
                 if t.transformer_id == transformer_id), None)


def _feeder_ratio(feeder_id: str) -> Optional[float]:
    result = state.get_base_result()
    return next((f.load_ratio_percent for f in result.feeder_loadings
                 if f.feeder_id == feeder_id), None)


# ---------- Transformer ----------
def list_transformers() -> list[TransformerDetail]:
    model = state.get_base_model()
    return [_transformer_detail(t.id) for t in model.transformers]


def get_transformer(transformer_id: str) -> Optional[TransformerDetail]:
    if state.get_base_model().transformer(transformer_id) is None:
        return None
    return _transformer_detail(transformer_id)


def _transformer_detail(transformer_id: str) -> TransformerDetail:
    model = state.get_base_model()
    tr = model.transformer(transformer_id)
    vcb = model.vcb(tr.vcb_id)
    feeder = model.feeder(tr.feeder_id) if tr.feeder_id else None
    buildings = model.buildings_on_transformer(transformer_id)
    return TransformerDetail(
        id=tr.id, name=tr.name, capacity_kva=tr.capacity_kva,
        lv_kv=tr.lv_kv, trafo_type=tr.trafo_type,
        vcb_id=vcb.id if vcb else "", vcb_name=vcb.name if vcb else "",
        feeder_id=feeder.id if feeder else None,
        feeder_name=feeder.name if feeder else None,
        connected_building_count=len(buildings),
        connected_buildings=[b.name for b in buildings],
        total_connected_load_kw=round(sum(b.load_kw for b in buildings), 1),
        load_ratio_percent=_trafo_ratio(transformer_id),
    )


# ---------- VCB ----------
def list_vcbs() -> list[VcbDetail]:
    model = state.get_base_model()
    return [_vcb_detail(v.id) for v in model.vcbs]


def get_vcb(vcb_id: str) -> Optional[VcbDetail]:
    if state.get_base_model().vcb(vcb_id) is None:
        return None
    return _vcb_detail(vcb_id)


def _vcb_detail(vcb_id: str) -> VcbDetail:
    model = state.get_base_model()
    vcb = model.vcb(vcb_id)
    transformers = model.transformers_on_vcb(vcb_id)
    feeders = model.feeders_on_vcb(vcb_id)
    buildings = model.buildings_on_vcb(vcb_id)
    return VcbDetail(
        id=vcb.id, name=vcb.name,
        feeder_count=len(feeders),
        transformer_count=len(transformers),
        transformers=[t.name for t in transformers],
        connected_building_count=len(buildings),
        total_connected_load_kw=round(sum(b.load_kw for b in buildings), 1),
    )


# ---------- Feeder ----------
def list_feeders() -> list[FeederDetail]:
    model = state.get_base_model()
    return [_feeder_detail(f.id) for f in model.feeders]


def get_feeder(feeder_id: str) -> Optional[FeederDetail]:
    if state.get_base_model().feeder(feeder_id) is None:
        return None
    return _feeder_detail(feeder_id)


def _feeder_detail(feeder_id: str) -> FeederDetail:
    model = state.get_base_model()
    f = model.feeder(feeder_id)
    vcb = model.vcb(f.vcb_id)
    transformers = model.transformers_on_feeder(feeder_id)
    buildings = model.buildings_on_feeder(feeder_id)
    ratio = _feeder_ratio(feeder_id)
    return FeederDetail(
        id=f.id, name=f.name,
        vcb_id=vcb.id if vcb else "", vcb_name=vcb.name if vcb else "",
        length_m=f.length_m,
        cross_section_mm2=f.cross_section_mm2,
        overloaded=(ratio is not None and ratio > 100),
        transformer_count=len(transformers),
        transformers=[t.name for t in transformers],
        connected_building_count=len(buildings),
        connected_buildings=[b.name for b in buildings],
        total_connected_load_kw=round(sum(b.load_kw for b in buildings), 1),
        load_ratio_percent=ratio,
    )
