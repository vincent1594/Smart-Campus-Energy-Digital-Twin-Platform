"""翻譯層 —— 把既有 pandapower net 的 res_* 結果轉成業務語意 DTO。

★ 唯一允許出現 pandapower 欄位 (vm_pu / loading_percent / pl_mw) 的地方。
讀取靠 engine 提供的 name->index 對照表 (NetIndex)。
"""
from __future__ import annotations

from webapi.engine import NetIndex
from webapi.domain import CampusModel
from webapi.schemas import (
    BuildingVoltage,
    BusFlow,
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

    # 全母線潮流表:電壓大小/相角 + 注入功率 + 分類。
    # 分類慣例 (同 pandapower):掛 ext_grid 的母線 = Slack(swing);掛電壓控制發電機 gen = PV;其餘 = PQ。
    # 本模型只有台電受電點一個 ext_grid、無 gen,故實際為「1 個 Slack + 其餘 PQ」。
    slack_buses = set(net.ext_grid.bus.tolist()) if len(net.ext_grid) > 0 else set()
    pv_buses = set(net.gen.bus.tolist()) if len(net.gen) > 0 else set()
    # 逐母線把負載 Q 與電容器(shunt)Q 拆開 —— 母線淨 Q 是兩者相加,拆開才看得到電容補償量
    load_q_by_bus: dict[int, float] = {}
    for li in net.load.index:
        b = int(net.load.at[li, "bus"])
        load_q_by_bus[b] = load_q_by_bus.get(b, 0.0) + float(net.res_load.q_mvar.at[li])
    shunt_q_by_bus: dict[int, float] = {}
    for si in net.shunt.index:
        b = int(net.shunt.at[si, "bus"])
        shunt_q_by_bus[b] = shunt_q_by_bus.get(b, 0.0) + float(net.res_shunt.q_mvar.at[si])
    bus_flows: list[BusFlow] = []
    for i in net.bus.index:
        vm = float(net.res_bus.vm_pu.at[i])
        if vm != vm:   # NaN → 孤島母線 (未與電源連通),略過
            continue
        if i in slack_buses:
            bus_type = "Slack"
        elif i in pv_buses:
            bus_type = "PV"
        else:
            bus_type = "PQ"
        bus_flows.append(BusFlow(
            bus_name=str(net.bus.name.at[i]),
            bus_type=bus_type,
            vn_kv=round(float(net.bus.vn_kv.at[i]), 3),
            vm_pu=round(vm, 4),
            va_degree=round(float(net.res_bus.va_degree.at[i]), 3),
            p_kw=round(float(net.res_bus.p_mw.at[i]) * 1000, 2),
            q_kvar=round(float(net.res_bus.q_mvar.at[i]) * 1000, 2),
            load_q_kvar=round(load_q_by_bus.get(i, 0.0) * 1000, 2),
            shunt_q_kvar=round(shunt_q_by_bus.get(i, 0.0) * 1000, 2),
        ))

    total_load_kw = round(float(stats.get("total_load_p_kw", 0.0)), 1)
    total_load_kvar = round(float(stats.get("total_load_q_kvar", 0.0)), 1)
    system_loss_kw = round(
        float(stats.get("total_loss_p_kw", 0.0)) + float(stats.get("trafo_loss_p_kw", 0.0)), 1
    )
    system_loss_kvar = round(
        float(stats.get("total_loss_q_kvar", 0.0)) + float(stats.get("trafo_loss_q_kvar", 0.0)), 1
    )
    # 鐵損/銅損拆分:鐵損=在役變壓器空載損(pfe)加總,與負載無關;銅損=系統總損扣掉鐵損(線損+變壓器負載損)。
    # 兩者相加恆等於 system_loss_kw;銅損夾在 0 以上避免極低載時的微小負值。
    iron_loss_kw = round(float(net.trafo.pfe_kw[net.trafo.in_service].sum()), 1)
    copper_loss_kw = round(max(0.0, system_loss_kw - iron_loss_kw), 1)
    grid_import_kw = round(float(stats.get("ext_grid_p_kw", 0.0)), 1)
    grid_import_kvar = round(float(stats.get("ext_grid_q_kvar", 0.0)), 1)
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
        iron_loss_kw=iron_loss_kw,
        copper_loss_kw=copper_loss_kw,
        grid_import_kw=grid_import_kw,
        grid_import_kvar=grid_import_kvar,
        min_voltage_pu=round(worst.voltage_pu, 4) if worst else 0.0,
        min_voltage_building_id=worst.building_id if worst else None,
        min_voltage_building_name=worst.building_name if worst else None,
        max_transformer_load_ratio_percent=round(max_tr, 1),
        max_feeder_load_ratio_percent=round(max_fd, 1),
        transformer_loadings=transformer_loadings,
        feeder_loadings=feeder_loadings,
        building_voltages=building_voltages,
        bus_flows=bus_flows,
    )
