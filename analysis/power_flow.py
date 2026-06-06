"""
S1 Baseline Power Flow Analysis
運行牛頓-拉夫遜潮流計算 (Newton-Raphson)
"""

import pandapower as pp
import numpy as np
import logging
from typing import Dict, Tuple

# 導入必要的模塊
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.network_builder import build_network_s1_baseline
from data.parameters import PANDAPOWER_CONFIG, SYSTEM_PARAMS, VOLTAGE_LIMIT_MIN, VOLTAGE_LIMIT_MAX

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# 主要潮流計算函數
# ============================================================================

def run_s1_baseline_powerflow(net=None, verbose=True):
    """
    運行 S1 Baseline 牛頓-拉夫遜潮流計算
    
    参数:
        net: PandaPower 網路 (如為 None，自動構建)
        verbose: 是否輸出詳細信息
    
    返回:
        net: 包含潮流結果的 PandaPower 網路
        results: 潮流計算結果摘要
    """
    
    logger.info("=" * 80)
    logger.info("S1 BASELINE 潮流計算 (Newton-Raphson)")
    logger.info("=" * 80)
    
    # 1. 建構或使用提供的網路
    if net is None:
        logger.info("正在構建 PandaPower 網路...")
        net = build_network_s1_baseline()
    else:
        logger.info("使用提供的網路")
    
    # 2. 驗證網路
    try:
        assert len(net.bus) > 0, "網路中沒有母線"
        assert len(net.load) > 0, "網路中沒有負載"
        logger.info(f"✓ 網路驗證通過 (母線: {len(net.bus)}, 負載: {len(net.load)})")
    except AssertionError as e:
        logger.error(f"✗ 網路驗證失敗: {e}")
        raise
    
    # 3. 配置潮流計算參數
    _configure_powerflow(net)
    
    # 4. 運行潮流計算
    logger.info("\nStart Newton-Raphson power flow calculation...")
    logger.info(f"  Algorithm: {PANDAPOWER_CONFIG['algorithm']}")
    logger.info(f"  Max iterations: {PANDAPOWER_CONFIG['max_iteration']}")
    logger.info(f"  Tolerance (MW): {PANDAPOWER_CONFIG['tolerance_mv']}")
    
    try:
        # 運行潮流
        pp.runpp(
            net,
            algorithm=PANDAPOWER_CONFIG['algorithm'],
            max_iteration=PANDAPOWER_CONFIG['max_iteration'],
            tolerance_mva=PANDAPOWER_CONFIG['tolerance_mv'],
            init='flat'  # 從平電壓開始
        )
        
        logger.info("✓ 潮流計算收斂成功\n")
        
    except Exception as e:
        logger.error(f"✗ 潮流計算失敗: {e}")
        raise
    
    # 5. 提取計算結果
    results = _extract_results(net)
    
    # 6. 檢查約束違反
    convergence_check = _check_convergence(net)
    results["convergence"] = convergence_check
    
    # 7. 輸出摘要
    if verbose:
        _print_powerflow_summary(net, results)
    
    logger.info("=" * 80 + "\n")
    
    return net, results


# ============================================================================
# 潮流配置函數
# ============================================================================

def _configure_powerflow(net):
    """
    配置潮流計算參數
    """
    # 設定所有負載為恆功率模型
    net.load["const_z_percent"] = 0
    net.load["const_i_percent"] = 0
    net.load["const_p_percent"] = 100
    
    # 設定所有母線的電壓限制
    net.bus["min_vm_pu"] = VOLTAGE_LIMIT_MIN  # 最低電壓規範
    net.bus["max_vm_pu"] = VOLTAGE_LIMIT_MAX  # 最高電壓規範
    
    # 設定變壓器的過載限制
    for idx in net.trafo.index:
        net.trafo.at[idx, "max_loading_percent"] = 100  # 允許最大 100% 負載
    
    logger.info("✓ 潮流參數配置完成")


# ============================================================================
# 結果提取函數
# ============================================================================

def _extract_results(net) -> Dict:
    """
    從 PandaPower 網路提取計算結果
    """
    results = {}
    
    # 1. 母線結果
    results["buses"] = net.res_bus.copy()
    
    # 2. 負載結果
    results["loads"] = net.res_load.copy() if len(net.load) > 0 else None
    
    # 3. 電纜結果
    results["lines"] = net.res_line.copy() if len(net.line) > 0 else None
    
    # 4. 變壓器結果
    results["transformers"] = net.res_trafo.copy() if len(net.trafo) > 0 else None
    
    # 5. 電容器結果
    results["shunts"] = net.res_shunt.copy() if len(net.shunt) > 0 else None
    
    # 6. 系統級統計
    results["system_stats"] = _compute_system_stats(net)
    
    return results


def _compute_system_stats(net) -> Dict:
    """
    計算系統級統計數據
    """
    stats = {}
    
    # 總功率統計 (pandapower 3.x 結果為 MW/MVar，乘 1000 轉為 kW/kVAr)
    stats["total_load_p_kw"] = net.load["p_mw"].sum() * 1000 if len(net.load) > 0 else 0
    stats["total_load_q_kvar"] = net.load["q_mvar"].sum() * 1000 if len(net.load) > 0 else 0
    stats["total_load_s_kva"] = np.sqrt(
        stats["total_load_p_kw"]**2 + stats["total_load_q_kvar"]**2
    )

    # 總損耗
    stats["total_loss_p_kw"] = net.res_line["pl_mw"].sum() * 1000 if len(net.line) > 0 else 0
    stats["total_loss_q_kvar"] = net.res_line["ql_mvar"].sum() * 1000 if len(net.line) > 0 else 0

    # 變壓器損耗
    if len(net.trafo) > 0:
        stats["trafo_loss_p_kw"] = net.res_trafo["pl_mw"].sum() * 1000
        stats["trafo_loss_q_kvar"] = net.res_trafo["ql_mvar"].sum() * 1000
    else:
        stats["trafo_loss_p_kw"] = 0
        stats["trafo_loss_q_kvar"] = 0

    # 外部電網功率
    stats["ext_grid_p_kw"] = net.res_ext_grid["p_mw"].sum() * 1000 if len(net.ext_grid) > 0 else 0
    stats["ext_grid_q_kvar"] = net.res_ext_grid["q_mvar"].sum() * 1000 if len(net.ext_grid) > 0 else 0
    
    # 母線統計
    hv_buses = net.bus[net.bus['vn_kv'] == 11.4]
    lv_buses = net.bus[net.bus['vn_kv'] != 11.4]
    
    stats["min_vm_pu_hv"] = net.res_bus.loc[hv_buses.index, "vm_pu"].min()
    stats["max_vm_pu_hv"] = net.res_bus.loc[hv_buses.index, "vm_pu"].max()
    
    if len(lv_buses) > 0:
        stats["min_vm_pu_lv"] = net.res_bus.loc[lv_buses.index, "vm_pu"].min()
        stats["max_vm_pu_lv"] = net.res_bus.loc[lv_buses.index, "vm_pu"].max()
    else:
        stats["min_vm_pu_lv"] = 1.0
        stats["max_vm_pu_lv"] = 1.0
    
    # 負載率統計
    if len(net.trafo) > 0:
        stats["max_trafo_loading_pct"] = net.res_trafo["loading_percent"].max()
        stats["avg_trafo_loading_pct"] = net.res_trafo["loading_percent"].mean()
    else:
        stats["max_trafo_loading_pct"] = 0
        stats["avg_trafo_loading_pct"] = 0
    
    if len(net.line) > 0:
        stats["max_line_loading_pct"] = net.res_line["loading_percent"].max()
        stats["avg_line_loading_pct"] = net.res_line["loading_percent"].mean()
    else:
        stats["max_line_loading_pct"] = 0
        stats["avg_line_loading_pct"] = 0
    
    return stats


# ============================================================================
# 驗證和檢查函數
# ============================================================================

def _check_convergence(net) -> Dict:
    """
    檢查潮流計算收斂和約束合規
    """
    check = {
        "converged": True,
        "voltage_violations": [],
        "thermal_violations": [],
        "isolated_buses": [],
        "unserved_load_kw": 0.0,
        "status": "OK"
    }

    # 檢查孤島母線（潮流結果為 NaN，代表未與電源連通）
    for idx in net.bus.index:
        vm_pu = net.res_bus.at[idx, "vm_pu"]
        if np.isnan(vm_pu):
            check["isolated_buses"].append(net.bus.at[idx, "name"])

    # 檢查未供電負載（功率平衡）：實供 = 外部電網送出 − 總損耗，與名目負載比對
    nominal_load_kw = net.load["p_mw"].sum() * 1000 if len(net.load) > 0 else 0
    ext_p_kw = net.res_ext_grid["p_mw"].sum() * 1000 if len(net.ext_grid) > 0 else 0
    loss_kw = (net.res_line["pl_mw"].sum() + net.res_trafo["pl_mw"].sum()) * 1000
    served_kw = ext_p_kw - loss_kw
    unserved_kw = nominal_load_kw - served_kw
    if unserved_kw > 1.0:  # 容許 1kW 數值誤差
        check["unserved_load_kw"] = round(unserved_kw, 1)

    # 檢查電壓違反（NaN 不計入；NaN 比較恆為 False）
    for idx in net.bus.index:
        vm_pu = net.res_bus.at[idx, "vm_pu"]
        if np.isnan(vm_pu):
            continue
        if vm_pu < VOLTAGE_LIMIT_MIN or vm_pu > VOLTAGE_LIMIT_MAX:
            bus_name = net.bus.at[idx, "name"]
            check["voltage_violations"].append({
                "bus": bus_name,
                "vm_pu": vm_pu,
                "type": "under" if vm_pu < VOLTAGE_LIMIT_MIN else "over"
            })
    
    # 檢查變壓器過載
    if len(net.trafo) > 0:
        for idx in net.trafo.index:
            loading = net.res_trafo.at[idx, "loading_percent"]
            if loading > 100:
                trafo_name = net.trafo.at[idx, "name"]
                check["thermal_violations"].append({
                    "equipment": trafo_name,
                    "type": "transformer",
                    "loading_percent": loading
                })
    
    # 檢查電纜過載
    if len(net.line) > 0:
        for idx in net.line.index:
            loading = net.res_line.at[idx, "loading_percent"]
            if loading > 100:
                line_name = net.line.at[idx, "name"]
                check["thermal_violations"].append({
                    "equipment": line_name,
                    "type": "line",
                    "loading_percent": loading
                })
    
    # 總體狀態判斷
    # 孤島母線或未供電負載屬嚴重錯誤 → ERROR；電壓/熱越限 → WARNING
    if len(check["isolated_buses"]) > 0 or check["unserved_load_kw"] > 0:
        check["status"] = "ERROR"
        check["converged"] = False
    elif len(check["voltage_violations"]) > 0 or len(check["thermal_violations"]) > 0:
        check["status"] = "WARNING"
        check["converged"] = False

    return check


# ============================================================================
# 輸出函數
# ============================================================================

def _print_powerflow_summary(net, results: Dict):
    """
    打印潮流計算摘要
    """
    stats = results["system_stats"]
    conv = results["convergence"]
    
    print("\n" + "=" * 80)
    print("S1 BASELINE 潮流計算結果摘要")
    print("=" * 80)
    
    # 收斂狀態
    status_symbol = "✓" if conv["status"] == "OK" else "⚠"
    print(f"\n{status_symbol} 計算狀態: {conv['status']}")
    
    # 功率統計
    print(f"\n功率統計:")
    print(f"  外部電網送出: {stats['ext_grid_p_kw']:.1f} kW, {stats['ext_grid_q_kvar']:.1f} kVAr")
    print(f"  總負載: {stats['total_load_p_kw']:.1f} kW, {stats['total_load_q_kvar']:.1f} kVAr")
    print(f"  線路損耗: {stats['total_loss_p_kw']:.1f} kW, {stats['total_loss_q_kvar']:.1f} kVAr")
    print(f"  變壓器損耗: {stats['trafo_loss_p_kw']:.1f} kW, {stats['trafo_loss_q_kvar']:.1f} kVAr")
    
    # 電壓統計
    print(f"\n電壓統計:")
    print(f"  11.4kV: {stats['min_vm_pu_hv']:.4f} - {stats['max_vm_pu_hv']:.4f} pu")
    print(f"  LV: {stats['min_vm_pu_lv']:.4f} - {stats['max_vm_pu_lv']:.4f} pu")
    
    # 負載率
    print(f"\n設備負載率:")
    print(f"  變壓器: {stats['avg_trafo_loading_pct']:.1f}% 平均, {stats['max_trafo_loading_pct']:.1f}% 最大")
    print(f"  電纜: {stats['avg_line_loading_pct']:.1f}% 平均, {stats['max_line_loading_pct']:.1f}% 最大")
    
    # 孤島母線 / 未供電負載（嚴重）
    if len(conv.get("isolated_buses", [])) > 0:
        iso = conv["isolated_buses"]
        print(f"\n✗ 孤島母線 ({len(iso)} 個，未與電源連通):")
        print(f"    {', '.join(iso)}")
    if conv.get("unserved_load_kw", 0) > 0:
        print(f"\n✗ 未供電負載: {conv['unserved_load_kw']:.1f} kW (功率平衡缺口)")

    # 約束檢查
    if len(conv["voltage_violations"]) > 0:
        print(f"\n⚠ 電壓違反 ({len(conv['voltage_violations'])} 個):")
        for v in conv["voltage_violations"][:5]:  # 最多顯示 5 個
            print(f"    {v['bus']}: {v['vm_pu']:.4f} pu ({v['type']})")
    
    if len(conv["thermal_violations"]) > 0:
        print(f"\n⚠ 熱過載 ({len(conv['thermal_violations'])} 個):")
        for t in conv["thermal_violations"][:5]:  # 最多顯示 5 個
            print(f"    {t['equipment']}: {t['loading_percent']:.1f}%")
    
    print("\n" + "=" * 80 + "\n")


def get_bus_summary(net) -> Dict:
    """
    獲取所有母線的摘要信息 (含 PQ/PV/Slack 分類)
    """
    # 母線類型: 有 ext_grid → Slack;有電壓控制發電機(gen)→ PV;其餘 → PQ
    slack_buses = set(net.ext_grid["bus"].tolist()) if len(net.ext_grid) > 0 else set()
    pv_buses = set(net.gen["bus"].tolist()) if len(net.gen) > 0 else set()

    summary = []
    for idx in net.bus.index:
        bus_name = net.bus.at[idx, "name"]
        bus_vn = net.bus.at[idx, "vn_kv"]
        vm_pu = net.res_bus.at[idx, "vm_pu"]
        va_degree = net.res_bus.at[idx, "va_degree"]
        p_kw = net.res_bus.at[idx, "p_mw"] * 1000
        q_kvar = net.res_bus.at[idx, "q_mvar"] * 1000

        if idx in slack_buses:
            bus_type = "Slack"
        elif idx in pv_buses:
            bus_type = "PV"
        else:
            bus_type = "PQ"

        summary.append({
            "bus_name": bus_name,
            "bus_type": bus_type,
            "vn_kv": bus_vn,
            "vm_pu": vm_pu,
            "va_degree": va_degree,
            "p_kw": p_kw,
            "q_kvar": q_kvar,
            "s_kva": np.sqrt(p_kw**2 + q_kvar**2)
        })

    return summary


def get_line_summary(net) -> Dict:
    """
    獲取所有電纜的摘要信息
    """
    summary = []
    
    for idx in net.line.index:
        line_name = net.line.at[idx, "name"]
        from_bus = net.bus.at[net.line.at[idx, "from_bus"], "name"]
        to_bus = net.bus.at[net.line.at[idx, "to_bus"], "name"]
        length_m = net.line.at[idx, "length_km"] * 1000
        cross_section = net.line.at[idx, "cross_section_mm2"] if "cross_section_mm2" in net.line.columns else None
        _lu = net.line.at[idx, "length_unknown"] if "length_unknown" in net.line.columns else False
        length_unknown = bool(_lu) if _lu == _lu else False  # NaN != NaN → 視為已知
        p_from_kw = net.res_line.at[idx, "p_from_mw"] * 1000
        q_from_kvar = net.res_line.at[idx, "q_from_mvar"] * 1000
        p_to_kw = net.res_line.at[idx, "p_to_mw"] * 1000
        q_to_kvar = net.res_line.at[idx, "q_to_mvar"] * 1000
        loading = net.res_line.at[idx, "loading_percent"]
        pl_kw = net.res_line.at[idx, "pl_mw"] * 1000
        ql_kvar = net.res_line.at[idx, "ql_mvar"] * 1000
        
        summary.append({
            "line_name": line_name,
            "from_bus": from_bus,
            "to_bus": to_bus,
            "cross_section_mm2": cross_section,
            "length_m": length_m,
            "length_unknown": length_unknown,
            "p_from_kw": p_from_kw,
            "q_from_kvar": q_from_kvar,
            "p_to_kw": p_to_kw,
            "q_to_kvar": q_to_kvar,
            "pl_kw": pl_kw,
            "ql_kvar": ql_kvar,
            "loading_percent": loading
        })
    
    return summary


def get_transformer_summary(net) -> Dict:
    """
    獲取所有變壓器的摘要信息
    """
    summary = []
    
    for idx in net.trafo.index:
        trafo_name = net.trafo.at[idx, "name"]
        hv_bus = net.bus.at[net.trafo.at[idx, "hv_bus"], "name"]
        lv_bus = net.bus.at[net.trafo.at[idx, "lv_bus"], "name"]
        sn_mva = net.trafo.at[idx, "sn_mva"]
        p_hv_kw = net.res_trafo.at[idx, "p_hv_mw"] * 1000
        q_hv_kvar = net.res_trafo.at[idx, "q_hv_mvar"] * 1000
        p_lv_kw = net.res_trafo.at[idx, "p_lv_mw"] * 1000
        q_lv_kvar = net.res_trafo.at[idx, "q_lv_mvar"] * 1000
        loading = net.res_trafo.at[idx, "loading_percent"]
        pl_kw = net.res_trafo.at[idx, "pl_mw"] * 1000
        ql_kvar = net.res_trafo.at[idx, "ql_mvar"] * 1000
        
        summary.append({
            "trafo_name": trafo_name,
            "hv_bus": hv_bus,
            "lv_bus": lv_bus,
            "sn_mva": sn_mva,
            "p_hv_kw": p_hv_kw,
            "q_hv_kvar": q_hv_kvar,
            "p_lv_kw": p_lv_kw,
            "q_lv_kvar": q_lv_kvar,
            "pl_kw": pl_kw,
            "ql_kvar": ql_kvar,
            "loading_percent": loading
        })
    
    return summary


if __name__ == "__main__":
    # 測試潮流計算
    net, results = run_s1_baseline_powerflow()
