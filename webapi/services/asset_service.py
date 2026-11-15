"""Asset Explorer:查詢變壓器 / VCB / 饋線,含容量、連接建築、負載率。

負載率取自已快取的 base 潮流結果;容量、連接關係取自 domain model。
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from webapi import state
from webapi.context import current_network
from webapi.schemas import DerAsset, FeederDetail, TransformerDetail, TransformerSpec, VcbDetail


def list_der() -> list[DerAsset]:
    """微電網設備清單 + 基準情境出力 (無微電網的網回空清單)。"""
    model = state.get_base_model()
    outs = {o.der_id: o for o in state.get_base_result().der_outputs}
    rows: list[DerAsset] = []
    for d in model.ders:
        o = outs.get(d.id)
        rows.append(DerAsset(
            der_id=d.id, name=d.name, kind=d.kind, site=d.site, building=d.building,
            transformer_id=d.transformer_id, rating_kw=d.rating_kw, kwp=d.kwp, energy_kwh=d.energy_kwh,
            interface=d.interface, note=d.note, source=d.source,
            power_kw=o.power_kw if o else 0.0, in_service=o.in_service if o else True,
        ))
    return rows

_SPECS_PATH = Path(__file__).resolve().parents[1] / "data" / "transformer_specs.json"

# 規格表 (transformer_specs.json) 為南北混合的全校 52 台。依「建築物」欄前綴字母判斷網別,
# 讓規格明細 / 汰換優先序 / 汰換投資回收 隨設備查詢的南北切換各自呈現。
# 南電網建物字首:E / H1 / H2 / H6 / U / O;污水處理廠 (= E棟-5) 亦屬南。其餘為北。
_SOUTH_SPEC_PREFIXES = {"E", "H1", "H2", "H6", "U", "O"}


def _spec_network(building: str) -> str:
    b = (building or "").strip()
    if "污水" in b:
        return "south"
    m = re.match(r"([A-Za-z]+\d*)", b)
    token = m.group(1).upper() if m else ""
    return "south" if token in _SOUTH_SPEC_PREFIXES else "north"


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


# ---------- 變壓器規格明細 (原始銘牌/實測資料) ----------
@lru_cache(maxsize=1)
def _all_transformer_specs() -> tuple[TransformerSpec, ...]:
    raw = json.loads(_SPECS_PATH.read_text(encoding="utf-8"))
    return tuple(TransformerSpec(**r) for r in raw)


def list_transformer_specs() -> list[TransformerSpec]:
    """依當前電網過濾規格表 (南北各自呈現);供規格明細 / 汰換優先序 / 汰換投資回收共用。"""
    nid = current_network.get()
    return [s for s in _all_transformer_specs() if _spec_network(s.building) == nid]


# ---------- VCB ----------
def list_vcbs() -> list[VcbDetail]:
    model = state.get_base_model()
    return [_vcb_detail(v.id) for v in model.vcbs]


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
        resistance_ohm=f.resistance_ohm,
        reactance_ohm=f.reactance_ohm,
        overloaded=(ratio is not None and ratio > 100),
        transformer_count=len(transformers),
        transformers=[t.name for t in transformers],
        connected_building_count=len(buildings),
        connected_buildings=[b.name for b in buildings],
        total_connected_load_kw=round(sum(b.load_kw for b in buildings), 1),
        load_ratio_percent=ratio,
    )
