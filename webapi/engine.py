"""底層引擎橋接 —— 包覆 repo 既有的 pandapower 模型。

唯一接觸既有 builder / power_flow 的地方。對外提供:
  build_base()        建立 base net + 跑潮流 + 解析 domain + 建立 index 對照表
  run_power_flow(net) 在 (可能已修改的) net 上重跑潮流並回傳結果
index 對照表 (name -> pandapower index) 是翻譯層的命脈。
"""
from __future__ import annotations

from dataclasses import dataclass, field

# 來自 repo 根目錄的既有真實模型 (從 repo 根啟動即原生可 import)
from analysis.power_flow import run_s1_baseline_powerflow  # type: ignore
from data.network_structure import FEEDERS  # type: ignore
from models.network_builder import build_network_s1_baseline  # type: ignore

from webapi.building_names import building_name
from webapi.config import SOURCE_NAME
from webapi.domain import Building, CampusModel, Feeder, Transformer, VCB


@dataclass
class NetIndex:
    """name -> pandapower index 對照表。"""
    trafo_by_name: dict[str, int] = field(default_factory=dict)
    line_by_name: dict[str, int] = field(default_factory=dict)
    load_by_name: dict[str, int] = field(default_factory=dict)
    load_bus_by_name: dict[str, int] = field(default_factory=dict)


@dataclass
class BaseModel:
    """base 狀態:net + 潮流結果 + domain + index,啟動時建一次並快取。"""
    net: object
    results: dict
    model: CampusModel
    index: NetIndex


def _build_index(net) -> NetIndex:
    idx = NetIndex()
    for i in net.trafo.index:
        idx.trafo_by_name[str(net.trafo.at[i, "name"])] = int(i)
    for i in net.line.index:
        idx.line_by_name[str(net.line.at[i, "name"])] = int(i)
    for i in net.load.index:
        name = str(net.load.at[i, "name"])
        idx.load_by_name[name] = int(i)
        idx.load_bus_by_name[name] = int(net.load.at[i, "bus"])
    return idx


def _parse_campus_model(net, index: NetIndex) -> CampusModel:
    """從 FEEDERS 拓樸解析業務實體;負載 kW/pf 由建好的 net 反推 (與計算一致)。"""
    vcbs: list[VCB] = []
    feeders: list[Feeder] = []
    transformers: list[Transformer] = []
    buildings: list[Building] = []
    seen_feeders: set[str] = set()

    def add_feeder(feeder_id: str, vcb_id: str, cable: dict, line_name: str) -> None:
        # feeder_id 須與 VCB / 其他節點 id 不撞名;line_name 才是反查 net.line 的鍵
        if feeder_id and feeder_id not in seen_feeders:
            cs = cable.get("cross_section") if cable else None
            # 整段 R/X 取自 net.line 實際參數 (r/x_ohm_per_km × 長度;已含並聯 qty)
            r_ohm = x_ohm = None
            li = index.line_by_name.get(line_name)
            if li is not None:
                lkm = float(net.line.at[li, "length_km"])
                r_ohm = round(float(net.line.at[li, "r_ohm_per_km"]) * lkm, 3)
                x_ohm = round(float(net.line.at[li, "x_ohm_per_km"]) * lkm, 3)
            feeders.append(Feeder(id=feeder_id, name=feeder_id, vcb_id=vcb_id,
                                  length_m=float((cable or {}).get("length", 0) or 0), line_name=line_name,
                                  cross_section_mm2=float(cs) if cs else None,
                                  resistance_ohm=r_ohm, reactance_ohm=x_ohm))
            seen_feeders.add(feeder_id)

    for vcb_key, vcb_def in FEEDERS.items():
        vcbs.append(VCB(id=vcb_key, name=str(vcb_def.get("name", vcb_key))))

        # 純電容補償饋線 (如 VCB12):只有電纜+電容,無變壓器/建築
        if "shunt_feeder" in vcb_def:
            sf = vcb_def["shunt_feeder"]
            fid = f"{vcb_key}_{sf['bus']}"
            add_feeder(fid, vcb_key, sf.get("cable", {}), line_name=fid)
            continue

        # 中間電纜 (cable_to_bus):net.line 名為 vcb_key,但 feeder id 須獨立避免撞名
        intermediate_id = f"{vcb_key}_IN" if "cable_to_bus" in vcb_def else None
        if intermediate_id:
            add_feeder(intermediate_id, vcb_key, vcb_def.get("cable_to_bus", {}), line_name=vcb_key)

        for sub in vcb_def.get("substations", []):
            bus = sub.get("bus")
            if "cable" in sub:
                feeder_id = f"{vcb_key}_{bus}"
                add_feeder(feeder_id, vcb_key, sub["cable"], line_name=feeder_id)
            else:
                feeder_id = intermediate_id  # 以母線開關耦合者,歸到中間電纜/None

            for trafo in sub.get("transformers", []):
                if trafo.get("status") == "disabled":
                    continue
                tname = str(trafo["name"])
                transformers.append(Transformer(
                    id=tname, name=tname, vcb_id=vcb_key, feeder_id=feeder_id,
                    capacity_kva=float(trafo["capacity"]),
                    lv_kv=float(trafo.get("voltage_lv", 0.22)),
                    trafo_type=str(trafo.get("type", "油")),
                    substation_bus=str(bus),
                ))
                for load_name in trafo.get("loads", []):
                    li = index.load_by_name.get(load_name)
                    if li is None:
                        continue
                    p_kw = float(net.load.at[li, "p_mw"]) * 1000
                    q_kvar = float(net.load.at[li, "q_mvar"]) * 1000
                    s = (p_kw ** 2 + q_kvar ** 2) ** 0.5
                    pf = (p_kw / s) if s > 0 else 1.0
                    buildings.append(Building(
                        id=load_name, name=building_name(load_name), transformer_id=tname,
                        load_kw=round(p_kw, 1), power_factor=round(pf, 3),
                    ))

    return CampusModel(vcbs=vcbs, feeders=feeders, transformers=transformers,
                       buildings=buildings, source_name=SOURCE_NAME)


def run_power_flow(net) -> dict:
    """在既有 net 上重跑潮流,回傳既有 power_flow 的 results dict。"""
    _, results = run_s1_baseline_powerflow(net=net, verbose=False)
    return results


def build_base() -> BaseModel:
    net = build_network_s1_baseline()
    _, results = run_s1_baseline_powerflow(net=net, verbose=False)
    index = _build_index(net)
    model = _parse_campus_model(net, index)
    return BaseModel(net=net, results=results, model=model, index=index)
