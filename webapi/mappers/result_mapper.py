"""翻譯層 —— 把既有 pandapower net 的 res_* 結果轉成業務語意 DTO。

★ 唯一允許出現 pandapower 欄位 (vm_pu / loading_percent / pl_mw) 的地方。
讀取靠 engine 提供的 name->index 對照表 (NetIndex)。
"""
from __future__ import annotations

from webapi.engine import NetIndex
from webapi.domain import CampusModel
from webapi.schemas import (
    BuildingVoltage,
    FeederLoading,
    PowerFlowResult,
    TransformerLoading,
)


def map_power_flow(model: CampusModel, net, index: NetIndex, results: dict) -> PowerFlowResult:
    stats = results.get("system_stats", {})
    conv = results.get("convergence", {})

    # 變壓器負載率
    transformer_loadings: list[TransformerLoading] = []
    for tr in model.transformers:
        i = index.trafo_by_name.get(tr.id)
        if i is None:
            continue
        ratio = float(net.res_trafo.loading_percent.at[i])
        # 容量讀自 net (Scenario 修改容量後仍正確),非 domain 的靜態值
        capacity_kva = float(net.trafo.sn_mva.at[i]) * 1000.0
        transformer_loadings.append(TransformerLoading(
            transformer_id=tr.id, transformer_name=tr.name,
            capacity_kva=round(capacity_kva, 1),
            actual_load_kva=round(ratio / 100.0 * capacity_kva, 1),
            load_ratio_percent=round(ratio, 1),
        ))

    # 饋線 (HV 電纜) 負載率
    feeder_loadings: list[FeederLoading] = []
    for f in model.feeders:
        i = index.line_by_name.get(f.line_name)
        if i is None:
            continue
        ratio = float(net.res_line.loading_percent.at[i])
        feeder_loadings.append(FeederLoading(
            feeder_id=f.id, feeder_name=f.name, load_ratio_percent=round(ratio, 1),
        ))

    # 各建築電壓 (取所屬負載 bus 的 vm_pu)
    building_voltages: list[BuildingVoltage] = []
    for b in model.buildings:
        bus = index.load_bus_by_name.get(b.id)
        if bus is None:
            continue
        vm = float(net.res_bus.vm_pu.at[bus])
        building_voltages.append(BuildingVoltage(
            building_id=b.id, building_name=b.name, voltage_pu=round(vm, 4),
        ))

    total_load_kw = round(float(stats.get("total_load_p_kw", 0.0)), 1)
    total_load_kvar = round(float(stats.get("total_load_q_kvar", 0.0)), 1)
    system_loss_kw = round(
        float(stats.get("total_loss_p_kw", 0.0)) + float(stats.get("trafo_loss_p_kw", 0.0)), 1
    )
    system_loss_kvar = round(
        float(stats.get("total_loss_q_kvar", 0.0)) + float(stats.get("trafo_loss_q_kvar", 0.0)), 1
    )
    grid_import_kw = round(float(stats.get("ext_grid_p_kw", 0.0)), 1)
    worst = min(building_voltages, key=lambda x: x.voltage_pu) if building_voltages else None
    max_tr = max((t.load_ratio_percent for t in transformer_loadings), default=0.0)
    max_fd = max((f.load_ratio_percent for f in feeder_loadings), default=0.0)

    # 既有 power_flow 的狀態:OK / WARNING(越限) / ERROR(孤島或未供電)
    status = conv.get("status", "OK")
    return PowerFlowResult(
        converged=status != "ERROR",
        status=status,
        total_load_kw=total_load_kw,
        total_load_kvar=total_load_kvar,
        system_loss_kw=system_loss_kw,
        system_loss_kvar=system_loss_kvar,
        grid_import_kw=grid_import_kw,
        min_voltage_pu=round(worst.voltage_pu, 4) if worst else 0.0,
        min_voltage_building_id=worst.building_id if worst else None,
        min_voltage_building_name=worst.building_name if worst else None,
        max_transformer_load_ratio_percent=round(max_tr, 1),
        max_feeder_load_ratio_percent=round(max_fd, 1),
        transformer_loadings=transformer_loadings,
        feeder_loadings=feeder_loadings,
        building_voltages=building_voltages,
    )
