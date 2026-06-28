"""
南電錶 — 結果匯出: 報告 (Markdown + 純文字) 與 CSV
報告結構: 1.分析基礎 2.執行摘要 3.系統級功率平衡 4.各饋線VCB摘要
          5.變壓器負載 6.母線電壓 7.電纜負載 8.合規與重點發現 9.單線圖
"""

import pandas as pd
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List
import sys

pass  # [phase0] sys.path.insert removed

import pandapower as pp
from networks.south.analysis.power_flow import get_bus_summary, get_line_summary, get_transformer_summary
from networks.south.data.network_structure import FEEDERS, MAIN_NETWORK
from networks.south.data.load_data import DEFAULT_BUILDING_LOADS
from networks.south.data.parameters import (SYSTEM_COINCIDENT_PEAK_KW, SYSTEM_PEAK_PERIOD, ACTIVE_SCENARIO,
                             VOLTAGE_LIMIT_MIN, VOLTAGE_LIMIT_MAX)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 負載 → 對應建物 (供報告顯示)
BUILDING_MAP = {
    "LOAD_H2": "H2 宿舍區", "LOAD_H1_2": "H1 第一宿舍", "LOAD_H1_3": "H1 第一宿舍",
    "LOAD_H6_1": "H6 第六宿舍", "LOAD_H6_2": "H6 第六宿舍",
    "LOAD_H6_3": "H6 第六宿舍", "LOAD_H6_4": "H6 第六宿舍",
    "LOAD_E_1": "E 圖書資訊館", "LOAD_E_2": "E 圖書資訊館",
    "LOAD_E_3": "E 圖書資訊館", "LOAD_E_4": "E 圖書資訊館",
    "LOAD_E_5": "E 圖書資訊館", "LOAD_U_1": "U 優活館", "LOAD_O": "O 高齡福祉館",
}

DATA_NOTE = ("負載為佔位估算 (容量×0.5、自然功因0.85)，待實測值替換 data/load_data.py;"
             "各 LV 母線並聯電容已依 VCB 圖以顯式 shunt 建模。")


# ============================================================================
# 主匯出函數
# ============================================================================
def export_s1_results(net, results: Dict, output_dir: str = None):
    output_path = Path(output_dir or ".")
    output_path.mkdir(parents=True, exist_ok=True)
    logger.info("=" * 80)
    logger.info("開始匯出 南電錶 結果")
    logger.info("=" * 80)

    files = []
    meta, sections = _build_report(net, results)

    md = output_path / "s1_baseline_report.md"
    md.write_text(_render_markdown(meta, sections), encoding="utf-8")
    files.append(str(md)); logger.info(f"✓ Markdown 報告: {md}")

    txt = output_path / "s1_baseline_report.txt"
    txt.write_text(_render_text(meta, sections), encoding="utf-8")
    files.append(str(txt)); logger.info(f"✓ 純文字報告: {txt}")

    for fname, fn in [
        ("s1_bus_voltage.csv", _export_bus_data),
        ("s1_line_loading.csv", _export_line_data),
        ("s1_transformer_loading.csv", _export_transformer_data),
        ("s1_load_data.csv", _export_load_data),
    ]:
        fpath = output_path / fname
        fn(net, fpath); files.append(str(fpath)); logger.info(f"✓ CSV: {fpath}")

    logger.info("=" * 80 + "\n")
    return files


# ============================================================================
# 章節建構
# ============================================================================
def _build_report(net, results: Dict):
    stats = results["system_stats"]
    conv = results["convergence"]
    total_kw = SYSTEM_COINCIDENT_PEAK_KW if SYSTEM_COINCIDENT_PEAK_KW else stats["total_load_p_kw"]
    meta = {
        "title": f"校園 11.4kV 配電系統 (南電錶) 潮流分析報告 — 情境 {ACTIVE_SCENARIO}",
        "subtitle": (f"負載情境: {SYSTEM_PEAK_PERIOD} ({total_kw:.0f} kW)"
                     f" | 產生時間 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                     f" | Newton-Raphson | pandapower {pp.__version__}"),
    }
    sections = [
        _sec_basis(net, stats),
        _sec_summary(net, stats, conv),
        _sec_power_balance(stats),
        _sec_feeder(net),
        _sec_loads(net),
        _sec_transformers(net),
        _sec_buses(net),
        _sec_lines(net),
        _sec_findings(net, stats, conv),
        _sec_single_line(net),
    ]
    for i, s in enumerate(sections, 1):
        s["no"] = str(i)
    return meta, sections


def _sec_basis(net, stats):
    raw_total = sum(ld["p_kw"] for ld in DEFAULT_BUILDING_LOADS.values())
    n_hv = int((net.bus["vn_kv"] == 11.4).sum())
    n_lv = int((net.bus["vn_kv"] != 11.4).sum())
    if SYSTEM_COINCIDENT_PEAK_KW and raw_total > 0:
        div = SYSTEM_COINCIDENT_PEAK_KW / raw_total
        load_basis = f"{SYSTEM_PEAK_PERIOD};系統同時負載 {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW"
        div_str = f"{div:.3f}(各台加總 {raw_total:,.0f} kW → {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW)"
    else:
        load_basis = f"{SYSTEM_PEAK_PERIOD};各台負載直接加總 {raw_total:,.0f} kW"
        div_str = "1.000(未縮放)"
    rows = [
        ("負載基礎", load_basis),
        ("分散係數", div_str),
        ("功率因數", "採各台自然(補償前)功因;LV 母線並聯電容以顯式 shunt 建模補償"),
        ("負載分布來源", "★ 佔位估算 (容量×0.5),待實測替換"),
        ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
        ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
        ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
    ]
    notes = [f"⚠ {DATA_NOTE}"]
    method = [
        "負載分配方法 (Load Allocation)",
        "",
        "  Step 1  各變壓器有功 P_i (data/load_data.py;目前為容量×0.5 佔位)",
        f"          ΣP = {raw_total:,.1f} kW",
        "  Step 2  (選用) 分散係數縮放至系統同時負載: P_i ← P_i × k",
        "  Step 3  無功 Q_i = P_i × tan(arccos(pf_i)),pf 為自然(補償前)值",
        "  Step 4  各 LV 母線並聯電容 (CAP_*) 以顯式 shunt 提供無功補償",
    ]
    return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
            "rows": rows, "notes": notes, "post_pre": method}


def _sec_summary(net, stats, conv):
    P = stats["total_load_p_kw"]; S = stats["total_load_s_kva"]
    pf = P / S if S > 0 else 1.0
    total_loss = stats["total_loss_p_kw"] + stats["trafo_loss_p_kw"]
    loss_pct = 100 * total_loss / P if P > 0 else 0
    ok = "✓" if conv["status"] == "OK" else ("✗" if conv["status"] == "ERROR" else "⚠")
    volt_ok = "✓" if not conv["voltage_violations"] else "✗"
    therm_ok = "✓" if not conv["thermal_violations"] else "✗"
    conn_ok = "✓" if not conv.get("isolated_buses") and conv.get("unserved_load_kw", 0) == 0 else "✗"
    egp = stats["ext_grid_p_kw"]; egq = stats["ext_grid_q_kvar"]
    egs = (egp**2 + egq**2)**0.5
    eg_pf = abs(egp) / egs if egs > 0 else 1.0
    rows = [
        ("計算狀態", conv["status"], ok),
        ("總負載 (負載端)", f"{P:,.0f} kW / {stats['total_load_q_kvar']:,.0f} kVAr / {S:,.0f} kVA (PF={pf:.3f})", "—"),
        ("受電點功率因數", f"{eg_pf:.3f}  (台電進線 {egp:,.0f} kW / {egq:,.0f} kVAr,含電容補償)",
         "✓" if eg_pf >= 0.95 else "⚠"),
        ("系統總損耗", f"{total_loss:,.1f} kW ({loss_pct:.2f}%)", "✓" if loss_pct < 10 else "⚠"),
        ("最重變壓器", f"{stats['max_trafo_loading_pct']:.1f}%", therm_ok),
        ("最重電纜", f"{stats['max_line_loading_pct']:.1f}%", therm_ok),
        ("HV 電壓範圍", f"{stats['min_vm_pu_hv']:.4f} – {stats['max_vm_pu_hv']:.4f} pu", volt_ok),
        ("LV 電壓範圍", f"{stats['min_vm_pu_lv']:.4f} – {stats['max_vm_pu_lv']:.4f} pu", volt_ok),
        ("連通性 / 供電", "全連通,全負載供電" if conn_ok == "✓" else "有孤島/未供電", conn_ok),
    ]
    return {"no": "2", "title": "執行摘要", "kind": "table",
            "headers": ["指標", "數值", "判定"], "rows": rows}


def _sec_power_balance(stats):
    bal = stats["ext_grid_p_kw"] - stats["total_loss_p_kw"] - stats["trafo_loss_p_kw"]
    rows = [
        ("外部電網送出 — 有功", f"{stats['ext_grid_p_kw']:,.2f} kW"),
        ("外部電網送出 — 無功", f"{stats['ext_grid_q_kvar']:,.2f} kVAr"),
        ("總負載 — 有功", f"{stats['total_load_p_kw']:,.2f} kW"),
        ("總負載 — 無功", f"{stats['total_load_q_kvar']:,.2f} kVAr"),
        ("線路損耗", f"{stats['total_loss_p_kw']:,.2f} kW / {stats['total_loss_q_kvar']:,.2f} kVAr"),
        ("變壓器損耗", f"{stats['trafo_loss_p_kw']:,.2f} kW / {stats['trafo_loss_q_kvar']:,.2f} kVAr"),
        ("功率平衡核對", f"送出 − 損耗 = {bal:,.2f} kW  vs  負載 {stats['total_load_p_kw']:,.2f} kW"),
    ]
    return {"no": "3", "title": "系統級功率平衡", "kind": "kv", "rows": rows}


def _sec_feeder(net):
    vcb_map = _bus_vcb_map()
    agg = {}

    def slot(v):
        return agg.setdefault(v, {"p": 0.0, "q": 0.0, "loss": 0.0, "maxload": 0.0, "minv": 9.9})

    for idx in net.load.index:
        v = vcb_map.get(net.bus.at[net.load.at[idx, "bus"], "name"])
        if v:
            slot(v)["p"] += net.load.at[idx, "p_mw"] * 1000
            slot(v)["q"] += net.load.at[idx, "q_mvar"] * 1000
    for idx in net.trafo.index:
        v = vcb_map.get(net.bus.at[net.trafo.at[idx, "hv_bus"], "name"])
        if v:
            slot(v)["loss"] += net.res_trafo.at[idx, "pl_mw"] * 1000
            slot(v)["maxload"] = max(slot(v)["maxload"], float(net.res_trafo.at[idx, "loading_percent"]))
    for idx in net.line.index:
        lname = net.line.at[idx, "name"] or ""
        v = lname.split("_")[0] if lname.startswith("VCB") else None
        if v in agg:
            slot(v)["loss"] += net.res_line.at[idx, "pl_mw"] * 1000
            slot(v)["maxload"] = max(slot(v)["maxload"], float(net.res_line.at[idx, "loading_percent"]))
    for idx in net.bus.index:
        v = vcb_map.get(net.bus.at[idx, "name"])
        vm = net.res_bus.at[idx, "vm_pu"]
        if v and not pd.isna(vm):
            slot(v)["minv"] = min(slot(v)["minv"], float(vm))

    rows = []
    for v in sorted(agg, key=lambda x: int(x.replace("VCB", "")) if x.replace("VCB", "").isdigit() else 99):
        d = agg[v]
        rows.append([v, f"{d['p']:,.1f}", f"{d['q']:,.1f}", f"{d['loss']:.2f}",
                     f"{d['maxload']:.1f}", f"{d['minv']:.4f}" if d['minv'] < 9 else "—"])
    return {"no": "4", "title": "各饋線 (VCB) 摘要", "kind": "table",
            "headers": ["饋線", "負載(kW)", "無功(kVAr)", "損耗(kW)", "最重設備(%)", "最低電壓(pu)"],
            "rows": rows}


def _sec_loads(net):
    cap_by_bus, busload_q = {}, {}
    for si in net.shunt.index:
        b = net.shunt.at[si, "bus"]
        cap_by_bus[b] = cap_by_bus.get(b, 0.0) - net.res_shunt.at[si, "q_mvar"] * 1000
    for idx in net.load.index:
        b = net.load.at[idx, "bus"]
        busload_q[b] = busload_q.get(b, 0.0) + net.load.at[idx, "q_mvar"] * 1000

    rows_data = []
    for idx in net.load.index:
        nm = net.load.at[idx, "name"]; b = net.load.at[idx, "bus"]
        p = net.load.at[idx, "p_mw"] * 1000
        q = net.load.at[idx, "q_mvar"] * 1000
        cap = cap_by_bus.get(b, 0.0)
        if cap and busload_q.get(b):
            q = q - cap * (q / busload_q[b])
        s = (p**2 + q**2)**0.5
        pf = p / s if s > 0 else 1.0
        rows_data.append((nm, BUILDING_MAP.get(nm, ""), p, pf, q, s))

    rows_data.sort(key=lambda r: -r[2])
    tp = sum(r[2] for r in rows_data); tq = sum(r[4] for r in rows_data)
    ts = (tp**2 + tq**2)**0.5
    tpf = f"{tp/ts:.2f}" if ts > 0 else "—"
    headers = ["負載", "建物", "負載(kW)", "pf", "Q(kVAr)", "S(kVA)"]
    rows = [[nm, bld, f"{p:.1f}", f"{pf:.2f}", f"{q:.1f}", f"{s:.1f}"]
            for nm, bld, p, pf, q, s in rows_data]
    rows.append(["合計", f"{len(rows_data)} 筆", f"{tp:.1f}", tpf, f"{tq:.1f}", f"{ts:.1f}"])
    notes = ["pf / Q / S 為「含同母線並聯電容補償後」之有效值。", f"★ {DATA_NOTE}"]
    return {"no": "5", "title": "各負載點明細 (由大至小)", "kind": "table",
            "headers": headers, "rows": rows, "notes": notes}


def _sec_transformers(net):
    summ = sorted(get_transformer_summary(net), key=lambda x: -x["loading_percent"])
    rows = [[t["trafo_name"], t["hv_bus"], t["lv_bus"], f"{t['sn_mva']*1000:.0f}",
             f"{t['loading_percent']:.1f}", f"{t['pl_kw']:.2f}", _trafo_flag(t["loading_percent"])]
            for t in summ]
    return {"no": "6", "title": "變壓器負載", "kind": "table",
            "headers": ["變壓器", "HV母線", "LV母線", "容量(kVA)", "負載率(%)", "損耗(kW)", "旗標"],
            "rows": rows}


def _sec_buses(net):
    rank = {"Slack": 0, "PV": 1, "PQ": 2}
    summ = sorted(get_bus_summary(net), key=lambda x: (rank.get(x["bus_type"], 9), x["vm_pu"]))
    rows = [[b["bus_name"], b["bus_type"], f"{b['vn_kv']:.3f}", f"{b['vm_pu']:.4f}",
             f"{b['va_degree']:.2f}", f"{b['p_kw']:.1f}", f"{b['q_kvar']:.1f}", _volt_flag(b["vm_pu"])]
            for b in summ]
    return {"no": "7", "title": "母線電壓 (Slack/PV 置頂,PQ 由低至高)", "kind": "table",
            "headers": ["母線", "類型", "Vn(kV)", "Vm(pu)", "相角(°)", "P(kW)", "Q(kVAr)", "旗標"],
            "rows": rows}


def _sec_lines(net):
    summ = sorted(get_line_summary(net), key=lambda x: -x["loading_percent"])
    rows = []; has_unknown = False
    for ln in summ:
        cs = ln.get("cross_section_mm2")
        if ln.get("length_unknown"):
            has_unknown = True; len_str = "未知*"
        else:
            len_str = f"{ln.get('length_m', 0):.1f}"
        rows.append([ln["line_name"], ln["from_bus"], ln["to_bus"],
                     f"{cs:.0f}" if cs else "—", len_str,
                     f"{ln['loading_percent']:.1f}", f"{ln['p_from_kw']:.1f}",
                     f"{ln['q_from_kvar']:.1f}", f"{ln['pl_kw']:.2f}"])
    notes = []
    if has_unknown:
        notes.append("* 長度未知:台電進線主纜 / VCB1 進線實際長度未知,計算採假設值;其壓降/損耗僅供參考。")
    return {"no": "8", "title": "電纜負載 (由重至輕)", "kind": "table",
            "headers": ["電纜", "起點母線", "終點母線", "線徑(mm²)", "長度(m)",
                        "負載率(%)", "P起點(kW)", "Q起點(kVAr)", "損耗(kW)"],
            "rows": rows, "notes": notes}


def _sec_findings(net, stats, conv):
    lines = []
    if conv.get("isolated_buses"):
        lines.append(f"✗ 孤島母線 {len(conv['isolated_buses'])} 個:{', '.join(conv['isolated_buses'])}")
    if conv.get("unserved_load_kw", 0) > 0:
        lines.append(f"✗ 未供電負載:{conv['unserved_load_kw']:.1f} kW(功率平衡缺口)")
    if not conv.get("isolated_buses") and conv.get("unserved_load_kw", 0) == 0:
        lines.append("✓ 全母線連通,全負載皆供電")
    if conv["voltage_violations"]:
        lines.append(f"✗ 電壓越限 {len(conv['voltage_violations'])} 處:")
        for v in conv["voltage_violations"]:
            lines.append(f"    - {v['bus']}: {v['vm_pu']:.4f} pu ({v['type']})")
    else:
        lines.append(f"✓ 全母線電壓於 {VOLTAGE_LIMIT_MIN:.2f}–{VOLTAGE_LIMIT_MAX:.2f} pu 限值內")
    if conv["thermal_violations"]:
        lines.append(f"✗ 設備熱過載 {len(conv['thermal_violations'])} 處:")
        for t in conv["thermal_violations"]:
            lines.append(f"    - {t['equipment']} ({t['type']}): {t['loading_percent']:.1f}%")
    else:
        lines.append("✓ 全設備於熱載限值內")

    lines.append("")
    lines.append("重點發現:")
    total_loss = stats["total_loss_p_kw"] + stats["trafo_loss_p_kw"]
    if stats["total_load_p_kw"] > 0:
        lines.append(f"  • 系統總損耗 {total_loss:,.1f} kW,占負載 {100*total_loss/stats['total_load_p_kw']:.2f}%"
                     f"(其中變壓器 {stats['trafo_loss_p_kw']:.1f} kW)")
    lines.append(f"  • 最重變壓器負載率 {stats['max_trafo_loading_pct']:.1f}%,最重電纜 {stats['max_line_loading_pct']:.1f}%")
    lines.append(f"  • 電壓最低 {min(stats['min_vm_pu_hv'], stats['min_vm_pu_lv']):.4f} pu")

    lines.append("")
    lines.append("資料警示 (供方法學說明):")
    lines.append(f"  • {DATA_NOTE}")
    lines.append("  • 變壓器損耗採標準損耗表 (依油/乾式×容量查 P0/Pk 典型值),非各台實際銘牌值。")
    lines.append("  • TR_H2 與 H2_LV_BUS 間 100m×1.2 低壓電纜 (線徑未標) 未建模。")
    return {"no": "9", "title": "合規與重點發現", "kind": "text", "lines": lines}


def _sec_single_line(net):
    tr_load, tr_lv, tr_vm = {}, {}, {}
    for idx in net.trafo.index:
        nm = net.trafo.at[idx, "name"]
        tr_load[nm] = float(net.res_trafo.at[idx, "loading_percent"])
        lvb = net.trafo.at[idx, "lv_bus"]
        tr_lv[nm] = net.bus.at[lvb, "name"]
        tr_vm[nm] = float(net.res_bus.at[lvb, "vm_pu"])

    def bus_vm(name):
        m = net.bus[net.bus["name"] == name]
        return float(net.res_bus.at[m.index[0], "vm_pu"]) if len(m) else None

    main_vm = bus_vm("CU_BUS")
    lines = ["台電 11.4kV 電源   (Slack, 1.0000 pu)", "   |",
             "   |  進線主纜 250mm² x3  (長度未知)", "   |",
             f"===+=== CU_BUS 受電母線 ({main_vm:.4f} pu) " + "=" * 28]

    for vcb, d in FEEDERS.items():
        if "shunt_feeder" in d:
            sf = d["shunt_feeder"]; cap = sf["capacitor"]
            cbvm = bus_vm(sf["bus"])
            lines.append("   |")
            lines.append(f"   +--[{vcb}] 電容補償饋線")
            lines.append(f"   |    `-- {sf['bus']} ({cbvm:.4f}pu)" if cbvm is not None else f"   |    `-- {sf['bus']}")
            lines.append(f"   |           `-- 電容 {cap['name']}  {cap['rating']}kVAr @ {cap.get('rated_kv')}kV")
            continue
        subs = d.get("substations", [])
        if not subs:
            continue
        lines.append("   |")
        lines.append(f"   +--[{vcb}]")
        for si, sub in enumerate(subs):
            busname = sub.get("bus"); trs = sub.get("transformers", [])
            sub_last = (si == len(subs) - 1)
            lines.append(f"   |    {'`--' if sub_last else '|--'} {busname}")
            cont = "     " if sub_last else "|    "
            for ti, tr in enumerate(trs):
                nm = tr["name"]; capk = f"{tr.get('capacity')}kVA"; typ = tr.get("type", "油")
                t_last = (ti == len(trs) - 1)
                head = f"   |    {cont}  {'`--' if t_last else '|--'} {nm:<10} {capk:<8}{typ}式"
                if tr.get("status") == "disabled":
                    lines.append(f"{head}  [停用]")
                else:
                    lines.append(f"{head}  負載 {tr_load.get(nm,0):4.0f}%  -> {tr_lv.get(nm,'')} {tr_vm.get(nm,0):.4f}pu")

    lines.append("")
    lines.append("註: 變壓器負載率 = 視在負載 / 容量;LV 電壓為該變壓器低壓母線電壓。")
    lines.append("    VCB5 為電容補償饋線 (CB_BUS 並聯 200kVAr@11.95kV 電容)。")
    return {"no": "10", "title": "系統單線圖 (ASCII)", "kind": "text", "pre": True, "lines": lines}


# ============================================================================
# 渲染器
# ============================================================================
def _render_markdown(meta, sections) -> str:
    out = [f"# {meta['title']}", "", f"_{meta['subtitle']}_", ""]
    for s in sections:
        out.append(f"## {s['no']}. {s['title']}"); out.append("")
        if s["kind"] == "kv":
            out.append("| 項目 | 內容 |"); out.append("|---|---|")
            for k, v in s["rows"]:
                out.append(f"| {k} | {v} |")
        elif s["kind"] == "table":
            out.append("| " + " | ".join(s["headers"]) + " |")
            out.append("|" + "|".join(["---"] * len(s["headers"])) + "|")
            for r in s["rows"]:
                out.append("| " + " | ".join(str(x) for x in r) + " |")
        elif s["kind"] == "text":
            if s.get("pre"):
                out.append("```"); out.extend(s["lines"]); out.append("```")
            else:
                out.extend(ln if ln else "" for ln in s["lines"])
        if s.get("post_pre"):
            out.append(""); out.append("```"); out.extend(s["post_pre"]); out.append("```")
        for note in s.get("notes", []):
            out.append(""); out.append(f"> {note}")
        out.append("")
    out.append("---")
    out.append("_附:同目錄 CSV 檔 — s1_bus_voltage / s1_line_loading / s1_transformer_loading / s1_load_data_")
    return "\n".join(out)


def _render_text(meta, sections) -> str:
    W = 92
    out = ["=" * W, meta["title"], meta["subtitle"], "=" * W, ""]
    for s in sections:
        out.append(f"[{s['no']}] {s['title']}"); out.append("-" * W)
        if s["kind"] == "kv":
            kw = max(len(k) for k, _ in s["rows"])
            for k, v in s["rows"]:
                out.append(f"  {k:<{kw}}  {v}")
        elif s["kind"] == "table":
            out.extend(_txt_table(s["headers"], s["rows"]))
        elif s["kind"] == "text":
            out.extend(s["lines"])
        if s.get("post_pre"):
            out.append(""); out.extend(s["post_pre"])
        for note in s.get("notes", []):
            out.append(f"  {note}")
        out.append("")
    out.append("=" * W)
    out.append("附: CSV 檔 — s1_bus_voltage / s1_line_loading / s1_transformer_loading / s1_load_data")
    out.append("=" * W)
    return "\n".join(out)


def _txt_table(headers, rows) -> List[str]:
    cols = len(headers)
    widths = [_disp_w(headers[i]) for i in range(cols)]
    for r in rows:
        for i in range(cols):
            widths[i] = max(widths[i], _disp_w(str(r[i])))
    def fmt(cells):
        return "  ".join(_pad(str(c), widths[i]) for i, c in enumerate(cells))
    return [fmt(headers), "  ".join("-" * w for w in widths)] + [fmt(r) for r in rows]


def _disp_w(s: str) -> int:
    return sum(2 if ord(ch) > 0x2E80 else 1 for ch in s)


def _pad(s: str, width: int) -> str:
    return s + " " * (width - _disp_w(s))


def _bus_vcb_map() -> Dict[str, str]:
    m = {}
    for vcb, d in FEEDERS.items():
        if "shunt_feeder" in d:
            m[d["shunt_feeder"]["bus"]] = vcb
        for sub in d.get("substations", []):
            if sub.get("bus"):
                m[sub["bus"]] = vcb
            for tr in sub.get("transformers", []):
                if tr.get("lv_bus"):
                    m[tr["lv_bus"]] = vcb
    return m


def _trafo_flag(lp: float) -> str:
    if lp > 100: return "過載"
    if lp >= 80: return "重載"
    if lp < 15:  return "輕載"
    return "正常"


def _volt_flag(vm: float) -> str:
    if pd.isna(vm): return "孤島"
    if vm < VOLTAGE_LIMIT_MIN or vm > VOLTAGE_LIMIT_MAX: return "越限"
    if vm < VOLTAGE_LIMIT_MIN + 0.01: return "偏低"
    if vm > VOLTAGE_LIMIT_MAX - 0.01: return "偏高"
    return "正常"


# ============================================================================
# CSV 導出
# ============================================================================
def _export_bus_data(net, f):
    pd.DataFrame(get_bus_summary(net)).to_csv(f, index=False, encoding="utf-8-sig")


def _export_line_data(net, f):
    pd.DataFrame(get_line_summary(net)).to_csv(f, index=False, encoding="utf-8-sig")


def _export_transformer_data(net, f):
    pd.DataFrame(get_transformer_summary(net)).to_csv(f, index=False, encoding="utf-8-sig")


def _export_load_data(net, f):
    data = []
    for idx in net.load.index:
        p = net.load.at[idx, "p_mw"] * 1000; q = net.load.at[idx, "q_mvar"] * 1000
        s = (p**2 + q**2)**0.5
        data.append({
            "load_name": net.load.at[idx, "name"],
            "bus_name": net.bus.at[net.load.at[idx, "bus"], "name"],
            "p_kw": round(p, 2), "q_kvar": round(q, 2), "s_kva": round(s, 2),
            "pf": round(p / s, 3) if s > 0 else 1.0,
        })
    pd.DataFrame(data).to_csv(f, index=False, encoding="utf-8-sig")


if __name__ == "__main__":
    from networks.south.analysis.power_flow import run_s1_baseline_powerflow
    net, results = run_s1_baseline_powerflow()
    files = export_s1_results(net, results, output_dir="results/S1")
    print(f"\n✓ 共生成 {len(files)} 個文件")
