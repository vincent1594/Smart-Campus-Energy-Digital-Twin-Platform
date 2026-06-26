"""
南電錶 — 牛頓-拉夫遜潮流計算 (Newton-Raphson)
"""

import pandapower as pp
import numpy as np
import logging
import sys
from pathlib import Path
from typing import Dict

pass  # [phase0] sys.path.insert removed

from networks.south.models.network_builder import build_network_s1_baseline
from networks.south.data.parameters import PANDAPOWER_CONFIG, VOLTAGE_LIMIT_MIN, VOLTAGE_LIMIT_MAX

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_s1_baseline_powerflow(net=None, verbose=True):
    """運行潮流計算，回傳 (net, results)。"""
    logger.info("=" * 80)
    logger.info("南電錶 潮流計算 (Newton-Raphson)")
    logger.info("=" * 80)

    if net is None:
        net = build_network_s1_baseline()

    assert len(net.bus) > 0, "網路中沒有母線"
    assert len(net.load) > 0, "網路中沒有負載"
    logger.info(f"✓ 網路驗證通過 (母線: {len(net.bus)}, 負載: {len(net.load)})")

    _configure_powerflow(net)

    logger.info("\nStart Newton-Raphson power flow calculation...")
    pp.runpp(net,
             algorithm=PANDAPOWER_CONFIG['algorithm'],
             max_iteration=PANDAPOWER_CONFIG['max_iteration'],
             tolerance_mva=PANDAPOWER_CONFIG['tolerance_mv'],
             init='flat')
    logger.info("✓ 潮流計算收斂成功\n")

    results = _extract_results(net)
    results["convergence"] = _check_convergence(net)
    if verbose:
        _print_powerflow_summary(net, results)
    logger.info("=" * 80 + "\n")
    return net, results


def _configure_powerflow(net):
    net.load["const_z_percent"] = 0
    net.load["const_i_percent"] = 0
    net.load["const_p_percent"] = 100
    net.bus["min_vm_pu"] = VOLTAGE_LIMIT_MIN
    net.bus["max_vm_pu"] = VOLTAGE_LIMIT_MAX
    for idx in net.trafo.index:
        net.trafo.at[idx, "max_loading_percent"] = 100
    logger.info("✓ 潮流參數配置完成")


def _extract_results(net) -> Dict:
    return {
        "buses": net.res_bus.copy(),
        "loads": net.res_load.copy() if len(net.load) > 0 else None,
        "lines": net.res_line.copy() if len(net.line) > 0 else None,
        "transformers": net.res_trafo.copy() if len(net.trafo) > 0 else None,
        "shunts": net.res_shunt.copy() if len(net.shunt) > 0 else None,
        "system_stats": _compute_system_stats(net),
    }


def _compute_system_stats(net) -> Dict:
    s = {}
    s["total_load_p_kw"] = net.load["p_mw"].sum() * 1000 if len(net.load) > 0 else 0
    s["total_load_q_kvar"] = net.load["q_mvar"].sum() * 1000 if len(net.load) > 0 else 0
    s["total_load_s_kva"] = np.sqrt(s["total_load_p_kw"]**2 + s["total_load_q_kvar"]**2)
    s["total_loss_p_kw"] = net.res_line["pl_mw"].sum() * 1000 if len(net.line) > 0 else 0
    s["total_loss_q_kvar"] = net.res_line["ql_mvar"].sum() * 1000 if len(net.line) > 0 else 0
    if len(net.trafo) > 0:
        s["trafo_loss_p_kw"] = net.res_trafo["pl_mw"].sum() * 1000
        s["trafo_loss_q_kvar"] = net.res_trafo["ql_mvar"].sum() * 1000
    else:
        s["trafo_loss_p_kw"] = s["trafo_loss_q_kvar"] = 0
    s["ext_grid_p_kw"] = net.res_ext_grid["p_mw"].sum() * 1000 if len(net.ext_grid) > 0 else 0
    s["ext_grid_q_kvar"] = net.res_ext_grid["q_mvar"].sum() * 1000 if len(net.ext_grid) > 0 else 0

    hv = net.bus[net.bus['vn_kv'] == 11.4]
    lv = net.bus[net.bus['vn_kv'] != 11.4]
    s["min_vm_pu_hv"] = net.res_bus.loc[hv.index, "vm_pu"].min()
    s["max_vm_pu_hv"] = net.res_bus.loc[hv.index, "vm_pu"].max()
    if len(lv) > 0:
        s["min_vm_pu_lv"] = net.res_bus.loc[lv.index, "vm_pu"].min()
        s["max_vm_pu_lv"] = net.res_bus.loc[lv.index, "vm_pu"].max()
    else:
        s["min_vm_pu_lv"] = s["max_vm_pu_lv"] = 1.0
    if len(net.trafo) > 0:
        s["max_trafo_loading_pct"] = net.res_trafo["loading_percent"].max()
        s["avg_trafo_loading_pct"] = net.res_trafo["loading_percent"].mean()
    else:
        s["max_trafo_loading_pct"] = s["avg_trafo_loading_pct"] = 0
    if len(net.line) > 0:
        s["max_line_loading_pct"] = net.res_line["loading_percent"].max()
        s["avg_line_loading_pct"] = net.res_line["loading_percent"].mean()
    else:
        s["max_line_loading_pct"] = s["avg_line_loading_pct"] = 0
    return s


def _check_convergence(net) -> Dict:
    check = {"converged": True, "voltage_violations": [], "thermal_violations": [],
             "isolated_buses": [], "unserved_load_kw": 0.0, "status": "OK"}

    for idx in net.bus.index:
        if np.isnan(net.res_bus.at[idx, "vm_pu"]):
            check["isolated_buses"].append(net.bus.at[idx, "name"])

    nominal = net.load["p_mw"].sum() * 1000 if len(net.load) > 0 else 0
    ext_p = net.res_ext_grid["p_mw"].sum() * 1000 if len(net.ext_grid) > 0 else 0
    loss = (net.res_line["pl_mw"].sum() + net.res_trafo["pl_mw"].sum()) * 1000
    unserved = nominal - (ext_p - loss)
    if unserved > 1.0:
        check["unserved_load_kw"] = round(unserved, 1)

    for idx in net.bus.index:
        vm = net.res_bus.at[idx, "vm_pu"]
        if np.isnan(vm):
            continue
        if vm < VOLTAGE_LIMIT_MIN or vm > VOLTAGE_LIMIT_MAX:
            check["voltage_violations"].append(
                {"bus": net.bus.at[idx, "name"], "vm_pu": vm,
                 "type": "under" if vm < VOLTAGE_LIMIT_MIN else "over"})

    for idx in net.trafo.index:
        lp = net.res_trafo.at[idx, "loading_percent"]
        if lp > 100:
            check["thermal_violations"].append(
                {"equipment": net.trafo.at[idx, "name"], "type": "transformer", "loading_percent": lp})
    for idx in net.line.index:
        lp = net.res_line.at[idx, "loading_percent"]
        if lp > 100:
            check["thermal_violations"].append(
                {"equipment": net.line.at[idx, "name"], "type": "line", "loading_percent": lp})

    if check["isolated_buses"] or check["unserved_load_kw"] > 0:
        check["status"] = "ERROR"
        check["converged"] = False
    elif check["voltage_violations"] or check["thermal_violations"]:
        check["status"] = "WARNING"
        check["converged"] = False
    return check


def _print_powerflow_summary(net, results: Dict):
    s = results["system_stats"]
    conv = results["convergence"]
    print("\n" + "=" * 80)
    print("南電錶 潮流計算結果摘要")
    print("=" * 80)
    print(f"\n{'✓' if conv['status'] == 'OK' else '⚠'} 計算狀態: {conv['status']}")
    print(f"\n功率統計:")
    print(f"  外部電網送出: {s['ext_grid_p_kw']:.1f} kW, {s['ext_grid_q_kvar']:.1f} kVAr")
    print(f"  總負載: {s['total_load_p_kw']:.1f} kW, {s['total_load_q_kvar']:.1f} kVAr")
    print(f"  線路損耗: {s['total_loss_p_kw']:.1f} kW, {s['total_loss_q_kvar']:.1f} kVAr")
    print(f"  變壓器損耗: {s['trafo_loss_p_kw']:.1f} kW, {s['trafo_loss_q_kvar']:.1f} kVAr")
    print(f"\n電壓統計:")
    print(f"  11.4kV: {s['min_vm_pu_hv']:.4f} - {s['max_vm_pu_hv']:.4f} pu")
    print(f"  LV: {s['min_vm_pu_lv']:.4f} - {s['max_vm_pu_lv']:.4f} pu")
    print(f"\n設備負載率:")
    print(f"  變壓器: {s['avg_trafo_loading_pct']:.1f}% 平均, {s['max_trafo_loading_pct']:.1f}% 最大")
    print(f"  電纜: {s['avg_line_loading_pct']:.1f}% 平均, {s['max_line_loading_pct']:.1f}% 最大")
    if conv.get("isolated_buses"):
        print(f"\n✗ 孤島母線 ({len(conv['isolated_buses'])}): {', '.join(conv['isolated_buses'])}")
    if conv.get("unserved_load_kw", 0) > 0:
        print(f"\n✗ 未供電負載: {conv['unserved_load_kw']:.1f} kW")
    if conv["voltage_violations"]:
        print(f"\n⚠ 電壓違反 ({len(conv['voltage_violations'])}):")
        for v in conv["voltage_violations"][:5]:
            print(f"    {v['bus']}: {v['vm_pu']:.4f} pu ({v['type']})")
    if conv["thermal_violations"]:
        print(f"\n⚠ 熱過載 ({len(conv['thermal_violations'])}):")
        for t in conv["thermal_violations"][:5]:
            print(f"    {t['equipment']}: {t['loading_percent']:.1f}%")
    print("\n" + "=" * 80 + "\n")


# ============================================================================
# 摘要擷取 (供報告)
# ============================================================================
def get_bus_summary(net):
    slack = set(net.ext_grid["bus"].tolist()) if len(net.ext_grid) > 0 else set()
    pv = set(net.gen["bus"].tolist()) if len(net.gen) > 0 else set()
    out = []
    for idx in net.bus.index:
        p_kw = net.res_bus.at[idx, "p_mw"] * 1000
        q_kvar = net.res_bus.at[idx, "q_mvar"] * 1000
        out.append({
            "bus_name": net.bus.at[idx, "name"],
            "bus_type": "Slack" if idx in slack else ("PV" if idx in pv else "PQ"),
            "vn_kv": net.bus.at[idx, "vn_kv"],
            "vm_pu": net.res_bus.at[idx, "vm_pu"],
            "va_degree": net.res_bus.at[idx, "va_degree"],
            "p_kw": p_kw, "q_kvar": q_kvar, "s_kva": np.sqrt(p_kw**2 + q_kvar**2),
        })
    return out


def get_line_summary(net):
    out = []
    for idx in net.line.index:
        cs = net.line.at[idx, "cross_section_mm2"] if "cross_section_mm2" in net.line.columns else None
        _lu = net.line.at[idx, "length_unknown"] if "length_unknown" in net.line.columns else False
        out.append({
            "line_name": net.line.at[idx, "name"],
            "from_bus": net.bus.at[net.line.at[idx, "from_bus"], "name"],
            "to_bus": net.bus.at[net.line.at[idx, "to_bus"], "name"],
            "cross_section_mm2": cs,
            "length_m": net.line.at[idx, "length_km"] * 1000,
            "length_unknown": bool(_lu) if _lu == _lu else False,
            "p_from_kw": net.res_line.at[idx, "p_from_mw"] * 1000,
            "q_from_kvar": net.res_line.at[idx, "q_from_mvar"] * 1000,
            "p_to_kw": net.res_line.at[idx, "p_to_mw"] * 1000,
            "q_to_kvar": net.res_line.at[idx, "q_to_mvar"] * 1000,
            "pl_kw": net.res_line.at[idx, "pl_mw"] * 1000,
            "ql_kvar": net.res_line.at[idx, "ql_mvar"] * 1000,
            "loading_percent": net.res_line.at[idx, "loading_percent"],
        })
    return out


def get_transformer_summary(net):
    out = []
    for idx in net.trafo.index:
        out.append({
            "trafo_name": net.trafo.at[idx, "name"],
            "hv_bus": net.bus.at[net.trafo.at[idx, "hv_bus"], "name"],
            "lv_bus": net.bus.at[net.trafo.at[idx, "lv_bus"], "name"],
            "sn_mva": net.trafo.at[idx, "sn_mva"],
            "p_hv_kw": net.res_trafo.at[idx, "p_hv_mw"] * 1000,
            "q_hv_kvar": net.res_trafo.at[idx, "q_hv_mvar"] * 1000,
            "p_lv_kw": net.res_trafo.at[idx, "p_lv_mw"] * 1000,
            "q_lv_kvar": net.res_trafo.at[idx, "q_lv_mvar"] * 1000,
            "pl_kw": net.res_trafo.at[idx, "pl_mw"] * 1000,
            "ql_kvar": net.res_trafo.at[idx, "ql_mvar"] * 1000,
            "loading_percent": net.res_trafo.at[idx, "loading_percent"],
        })
    return out


if __name__ == "__main__":
    run_s1_baseline_powerflow()
