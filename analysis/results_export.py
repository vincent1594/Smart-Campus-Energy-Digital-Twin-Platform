"""
Results Export Module
將潮流計算結果導出為報告 (Markdown + 純文字) 與 CSV 檔
報告結構: 1.分析基礎 2.執行摘要 3.系統級功率平衡 4.各饋線VCB摘要
          5.變壓器負載 6.母線電壓 7.電纜負載 8.合規與重點發現
"""

import pandas as pd
import logging
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, List

# 導入必要的模塊
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandapower as pp
from analysis.power_flow import (
    get_bus_summary, get_line_summary, get_transformer_summary
)
from data.network_structure import FEEDERS
from data.load_data import DEFAULT_BUILDING_LOADS
from data.parameters import (SYSTEM_COINCIDENT_PEAK_KW, SYSTEM_PEAK_PERIOD, SYSTEM_LOAD_METHOD,
                             SYSTEM_LOAD_TIMESTAMP, SYSTEM_PV_FACTOR, ACTIVE_SCENARIO,
                             VOLTAGE_LIMIT_MIN, VOLTAGE_LIMIT_MAX)

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 資料警示常數 (真實有、模型未含 / 對應有歧義) — 供報告方法學說明
MISSING_BUILDINGS = "E圖書資訊館(TR-4~8)、H1第一宿舍、H6第六宿舍(TR-31~34)、U棟優活館、污水處理廠、O高齡福祉館"
UNMATCHED_LOADS = "LOAD_G1、LOAD_G2、LOAD_W2(真實資料無對應,沿用估計)"

# 負載 -> 對應建物 (供報告顯示)
BUILDING_MAP = {
    "LOAD_N": "N文炳館", "LOAD_Y": "Y三連堂", "LOAD_F1": "F資傳館", "LOAD_F2": "F資傳館",
    "LOAD_F3": "F資傳館", "LOAD_G1": "(未對應)", "LOAD_Z": "Z西淮館", "LOAD_M": "M念慈堂",
    "LOAD_G2": "(未對應)", "LOAD_H3_1": "H3宿舍", "LOAD_H3_2": "H3宿舍",
    "LOAD_K1": "K機械館", "LOAD_K2": "K機械館", "LOAD_K3": "K機械館", "LOAD_K4": "K機械館",
    "LOAD_K5": "K機械館", "LOAD_Q": "Q光電工程館", "LOAD_R": "R汽車工程館", "LOAD_R1": "R汽車工程館",
    "LOAD_L1": "L綜合大樓", "LOAD_L2": "L綜合大樓", "LOAD_P": "P電子物流", "LOAD_A": "A電機一館",
    "LOAD_B": "B電機二館", "LOAD_T": "T棟", "LOAD_V1": "V能源館", "LOAD_V2": "V能源館",
    "LOAD_C": "D管資館(C棟)", "LOAD_D": "D管資館(D棟)", "LOAD_S1": "S管科", "LOAD_S2": "S管科",
    "LOAD_J": "J電子二館", "LOAD_W1": "W生活館", "LOAD_W2": "(未對應)", "LOAD_W3": "W生活館",
    "LOAD_W4": "W生活館", "LOAD_I1": "I工學院", "LOAD_I2": "I工學院", "LOAD_I3": "I工學院",
    "LOAD_I4": "I工學院",
}


# ============================================================================
# 主要導出函數
# ============================================================================

def export_s1_results(net, results: Dict, output_dir: str = None, prefix: str = None):
    """
    導出潮流結果為報告 (md/txt) 與 CSV

    参数:
        net: PandaPower 網路
        results: 潮流計算結果
        output_dir: 輸出目錄 (默認為當前目錄)
        prefix: 檔名前綴 (預設取輸出目錄名,即情境代號,如 S2 → S2_report.md)

    返回:
        文件路徑列表
    """
    if output_dir is None:
        output_dir = "."

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    if prefix is None:
        prefix = output_path.name or "report"

    logger.info("=" * 80)
    logger.info("開始導出 S1 Baseline 結果")
    logger.info("=" * 80)

    files_created = []

    # 1. 建立報告章節資料 (格式無關)
    meta, sections = _build_report(net, results)

    # 2. 輸出 Markdown 主報告
    md_file = output_path / f"{prefix}_report.md"
    md_file.write_text(_render_markdown(meta, sections), encoding="utf-8")
    files_created.append(str(md_file))
    logger.info(f"✓ Markdown 報告: {md_file}")

    # 3. 輸出純文字報告
    txt_file = output_path / f"{prefix}_report.txt"
    txt_file.write_text(_render_text(meta, sections), encoding="utf-8")
    files_created.append(str(txt_file))
    logger.info(f"✓ 純文字報告: {txt_file}")

    # 4. CSV 數據檔
    for fname, fn in [
        (f"{prefix}_bus_voltage.csv", _export_bus_data),
        (f"{prefix}_line_loading.csv", _export_line_data),
        (f"{prefix}_transformer_loading.csv", _export_transformer_data),
        (f"{prefix}_load_data.csv", _export_load_data),
    ]:
        fpath = output_path / fname
        fn(net, fpath)
        files_created.append(str(fpath))
        logger.info(f"✓ CSV: {fpath}")

    logger.info("=" * 80 + "\n")
    return files_created


# ============================================================================
# 章節資料建構 (回傳 meta 與 sections，與輸出格式無關)
# ============================================================================
# section 結構: {"no": "1", "title": "...", "kind": "kv|table|text",
#                "rows"/"headers"+"rows"/"lines": ..., "notes": [..]}

def _build_report(net, results: Dict):
    stats = results["system_stats"]
    conv = results["convergence"]

    # 總負載: 有指定 load_kw 用之,否則(如 ems 實測法)取實際負載總和
    total_kw = SYSTEM_COINCIDENT_PEAK_KW if SYSTEM_COINCIDENT_PEAK_KW else stats["total_load_p_kw"]
    meta = {
        "title": f"校園 11.4kV 配電系統 潮流分析報告 — 情境 {ACTIVE_SCENARIO}",
        "subtitle": (f"負載情境: {SYSTEM_PEAK_PERIOD} ({total_kw:.0f} kW)"
                     f" | 產生時間 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                     f" | Newton-Raphson | pandapower {pp.__version__}"),
    }

    sections = []
    sections.append(_sec_basis(net, stats))
    sections.append(_sec_summary(net, stats, conv))
    sections.append(_sec_power_balance(stats))
    sections.append(_sec_feeder(net))
    sections.append(_sec_loads(net))
    sections.append(_sec_transformers(net))
    sections.append(_sec_buses(net))
    sections.append(_sec_lines(net))
    sections.append(_sec_findings(net, stats, conv))
    sections.append(_sec_single_line(net))

    # 依排列順序重編章節號 (覆寫各 _sec_* 的硬編號)
    for i, s in enumerate(sections, 1):
        s["no"] = str(i)
    return meta, sections


def _sec_basis(net, stats):
    is_area = (SYSTEM_LOAD_METHOD == "area")
    is_ems = (SYSTEM_LOAD_METHOD == "ems")
    is_emsprof = (SYSTEM_LOAD_METHOD == "ems_profile")
    is_xgb = (SYSTEM_LOAD_METHOD == "xgboost")
    is_xgbprof = (SYSTEM_LOAD_METHOD == "xgboost_profile")
    raw_total = sum(ld["p_kw"] for ld in DEFAULT_BUILDING_LOADS.values())

    n_hv = int((net.bus["vn_kv"] == 11.4).sum())
    n_lv = int((net.bus["vn_kv"] != 11.4).sum())

    if is_xgbprof:
        total_kw = SYSTEM_COINCIDENT_PEAK_KW
        rows = [
            ("負載基礎", f"{SYSTEM_PEAK_PERIOD},總負載 {total_kw:,.0f} kW"),
            ("分配方法", "XGBoost 預測各饋線占比 × 總負載 → 按容量/VCB3實測校正分到負載點"),
            ("模型", f"每饋線 XGBoost(5月訓練);取 {SYSTEM_LOAD_TIMESTAMP} 預測值之占比"),
            ("功率因數", "沿用各棟運轉功因 (變壓器細部資料)"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
        notes = [f"⚠ XGBoost 特徵僅含時段(小時)與星期,無氣溫/月份/年份 → 不同日期之預測僅取決於「星期+時段」(套用 5 月同型態);情境標籤的年/月僅為命名。",
                 f"⚠ 故本情境只借用模型的「饋線分布占比」,總量為情境設定值 ({SYSTEM_COINCIDENT_PEAK_KW:.0f} kW),非模型量級外推。模型未含 {MISSING_BUILDINGS}。",
                 f"☀ 有 PV 建築(D/L/M/P/Z,出力=容量×{SYSTEM_PV_FACTOR})已扣 PV;VCB3 用 L/Q/R 實測校正。"]
        method = [
            "負載分配方法 — XGBoost 占比法",
            "",
            f"  Step 1  XGBoost(5月訓練)預測各饋線於 {SYSTEM_LOAD_TIMESTAMP} 的 kW → 取占比 share_i (Σ=1)",
            f"  Step 2  各饋線負載 = share_i × 總負載 ({total_kw:.0f} kW)",
            "  Step 3  按變壓器容量(VCB3 用實測校正)分到負載點;PV 建築扣 PV",
            "  Step 4  無功 Q_i = P_i × tan(arccos(pf_i)),pf 沿用各棟運轉值",
        ]
        return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
                "rows": rows, "notes": notes, "post_pre": method}

    if is_xgb:
        total_kw = stats["total_load_p_kw"]
        rows = [
            ("負載基礎", f"{SYSTEM_PEAK_PERIOD},預測總負載 {total_kw:,.0f} kW"),
            ("分配方法", "XGBoost 預測各 VCB 饋線 kW → 按容量/VCB3實測校正分到負載點"),
            ("模型", "每饋線一個 XGBoost;特徵=小時/星期(sin/cos)+平日假日;5月訓練、6月測試"),
            ("功率因數", "沿用各棟運轉功因 (變壓器細部資料)"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
        notes = [f"⚠ XGBoost 特徵僅含時段(小時)與星期,無氣溫/月份/年份;僅用 5 月訓練、6 月測試。",
                 f"⚠ 預測為該「星期×時段」之典型值,對高溫尖峰會系統性偏低(對照 S0 實測)。模型未含 {MISSING_BUILDINGS}。",
                 f"☀ 有 PV 建築(D/L/M/P/Z,出力=容量×{SYSTEM_PV_FACTOR})已扣 PV;VCB3 用 L/Q/R 實測校正。"]
        method = [
            "負載分配方法 — XGBoost 預測法 (S2)",
            "",
            f"  Step 1  XGBoost(5月訓練)預測各饋線於 {SYSTEM_LOAD_TIMESTAMP} 的 kW",
            "  Step 2  各饋線預測值 → 按變壓器容量(VCB3 用實測校正)分到負載點",
            "  Step 3  PV 建築還原 gross 再扣 PV;Q_i = P_i × tan(arccos(pf_i))",
        ]
        return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
                "rows": rows, "notes": notes, "post_pre": method}

    if is_emsprof:
        total_kw = SYSTEM_COINCIDENT_PEAK_KW
        rows = [
            ("負載基礎", f"{SYSTEM_PEAK_PERIOD},總負載 {total_kw:,.0f} kW"),
            ("分配方法", "EMS 平日(一~五)日間半尖峰平均各饋線占比 × 總負載 → 按變壓器容量分到負載點"),
            ("功率因數", "沿用各棟運轉功因 (變壓器細部資料)"),
            ("負載分布來源", "EMS 5-6月平日 08:00–18:00 平均饋線占比 (規律)"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
        notes = [f"⚠ 占比取自 5-6月 EMS(無 3月實測);季節差異(冷氣)可能影響分布。模型未含 {MISSING_BUILDINGS}。",
                 f"☀ EMS 為淨台電(已扣 PV);有 PV 建築(D/L/M/P/Z,出力=容量×{SYSTEM_PV_FACTOR})已還原 gross 再扣 PV。",
                 "🔧 VCB3(K.L.Q.R)內部改用 L/Q/R 實測用電曲線校正占比(取代容量法);其餘饋線仍按變壓器容量。"]
        method = [
            "負載分配方法 — EMS 占比法 (S1)",
            "",
            "  Step 1  由 EMS 5-6月「平日 08:00–18:00」算各饋線平均占比 share_i (Σ=1)",
            f"  Step 2  各饋線負載 = share_i × 總負載 ({total_kw:.0f} kW)",
            "  Step 3  饋線內 → 按各台變壓器容量比例分到負載點",
            "  Step 4  無功 Q_i = P_i × tan(arccos(pf_i)),pf 沿用各棟運轉值",
        ]
        return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
                "rows": rows, "notes": notes, "post_pre": method}

    if is_ems:
        total_kw = stats["total_load_p_kw"]
        rows = [
            ("負載基礎", f"{SYSTEM_PEAK_PERIOD},總負載 {total_kw:,.0f} kW"),
            ("分配方法", "EMS 各 VCB 饋線實測值 → 按變壓器容量比例分到負載點 (實測即同時值,無分散係數)"),
            ("功率因數", "沿用各棟運轉功因 (變壓器細部資料)"),
            ("負載分布來源", f"EMS 逐時實測 (11205-06北) @ {SYSTEM_LOAD_TIMESTAMP}"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
        notes = [f"⚠ VCB4 實測含 X創思坊 (模型未含,併入 P);其餘饋線對應一致。模型未含 {MISSING_BUILDINGS}。",
                 f"☀ EMS 為淨台電(已扣 PV);有 PV 建築(D/L/M/P/Z,出力=容量×{SYSTEM_PV_FACTOR})已還原 gross 再扣 PV,故其淨台電負載較小。",
                 "🔧 VCB3(K.L.Q.R)內部改用 L/Q/R 實測用電曲線校正占比(取代容量法);其餘饋線仍按變壓器容量。"]
        method = [
            "負載分配方法 — EMS 實測法 (S0)",
            "",
            f"  Step 1  取 EMS 各 VCB 饋線於 {SYSTEM_LOAD_TIMESTAMP} 的實測功率 (kW)",
            "  Step 2  各饋線實測值 → 按該饋線各台變壓器容量比例,分配到負載點",
            "  Step 3  無功 Q_i = P_i × tan(arccos(pf_i)),pf 沿用各棟運轉值",
            "",
            "  說明: 實測值本為系統同時值,故不需分散係數;VCB12(SC)實測為 0,為純電容盤。",
        ]
        return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
                "rows": rows, "notes": notes, "post_pre": method}

    if is_area:
        rows = [
            ("負載基礎", f"{SYSTEM_PEAK_PERIOD},總負載 {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW"),
            ("分配方法", "樓地板面積 × 用途負載密度 (W/m²),正規化至總負載"),
            ("功率因數", "沿用各棟運轉功因 (變壓器細部資料)"),
            ("負載分布來源", "112年樓地板面積統計表 + 用途分類密度"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
    else:
        if SYSTEM_COINCIDENT_PEAK_KW and raw_total > 0:
            div = SYSTEM_COINCIDENT_PEAK_KW / raw_total
            load_basis = f"{SYSTEM_PEAK_PERIOD} 實測系統同時負載 {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW"
            div_str = f"{div:.3f}(各台實載加總 {raw_total:,.0f} kW → {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW)"
        else:
            load_basis = f"各台實載直接加總 {raw_total:,.0f} kW(未套用分散係數)"
            div_str = "1.000(未縮放)"
        rows = [
            ("負載基礎", load_basis),
            ("分散係數", div_str),
            ("功率因數", "採變壓器細部資料之運轉功因;已對應變壓器之並聯電容已折入功因,不另重複計入"),
            ("負載分布來源", "校園變壓器細部資料 TR-1~TR-52「平均負載」比例"),
            ("資料來源", "校園變壓器細部資料 (廠牌/容量/運轉值/電容)"),
            ("模型範圍", f"{len(net.trafo)} 台變壓器、{len(net.bus)} 母線 (HV {n_hv} / LV {n_lv})、{len(net.load)} 負載點"),
            ("演算法", f"Newton-Raphson (pandapower {pp.__version__})"),
            ("系統頻率 / 主電壓", f"{net.f_hz:.0f} Hz / 11.4 kV"),
        ]
    notes = [
        f"⚠ 模型未含(真實有)建物:{MISSING_BUILDINGS}。",
    ]

    # 負載分配方法與公式
    if is_area:
        method = [
            "負載分配方法 — 面積 × 用途密度法 (S0)",
            "",
            "  Step 1  各棟原始 = 樓地板面積 × 用途負載密度 (相對 W/m²)",
            "          密度: 實驗/工程系館18、生活餐飲20、教學行政15、宿舍/社團12、體育8",
            "",
            f"  Step 2  正規化 k0 = 總負載 / Σ(面積×密度);各棟負載 = 原始 × k0  (總和 = {SYSTEM_COINCIDENT_PEAK_KW:.0f} kW)",
            "",
            "  Step 3  棟內多台變壓器 → 按變壓器容量比例拆到各負載點",
            "",
            "  Step 4  無功 Q_i = P_i × tan(arccos(pf_i)),pf 沿用各棟運轉值",
        ]
    elif SYSTEM_COINCIDENT_PEAK_KW and raw_total > 0:
        k = SYSTEM_COINCIDENT_PEAK_KW / raw_total
        method = [
            "負載分配方法 (Load Allocation Method)",
            "",
            "  Step 1  原始有功 (相對權重)",
            "          P_raw,i = 各變壓器實測平均負載 (變壓器細部資料)",
            f"          ΣP_raw = {raw_total:,.1f} kW",
            "",
            "  Step 2  分散係數縮放 (守住系統同時負載)",
            f"          k = 系統同時負載 / ΣP_raw = {SYSTEM_COINCIDENT_PEAK_KW:.0f} / {raw_total:,.1f} = {k:.4f}",
            "          P_i = P_raw,i × k        (各棟同比例縮放,總和 = 系統同時負載)",
            "",
            "  Step 3  無功 (由各台運轉功因)",
            "          Q_i = P_i × tan(arccos(pf_i))",
            "",
            "  說明: k 即需量參差/分散係數,反映各棟不同時達峰;",
            "        各台平均負載直接加總會高於系統同時負載,故須以 k 縮放。",
        ]
    else:
        method = [
            "負載分配方法: 各變壓器實測平均負載直接代入 (未套用分散係數),",
            "Q_i = P_i × tan(arccos(pf_i))。",
        ]

    return {"no": "1", "title": "分析基礎與假設", "kind": "kv",
            "rows": rows, "notes": notes, "post_pre": method}


def _sec_summary(net, stats, conv):
    P = stats["total_load_p_kw"]
    S = stats["total_load_s_kva"]
    pf = P / S if S > 0 else 1.0
    total_loss = stats["total_loss_p_kw"] + stats["trafo_loss_p_kw"]
    loss_pct = 100 * total_loss / P if P > 0 else 0
    ok = "✓" if conv["status"] == "OK" else ("✗" if conv["status"] == "ERROR" else "⚠")

    volt_ok = "✓" if not conv["voltage_violations"] else "✗"
    therm_ok = "✓" if not conv["thermal_violations"] else "✗"
    conn_ok = "✓" if not conv.get("isolated_buses") and conv.get("unserved_load_kw", 0) == 0 else "✗"

    # 受電點 (台電進線) 功率因數 — 含電容補償後台電端看到的 PF
    egp = stats["ext_grid_p_kw"]
    egq = stats["ext_grid_q_kvar"]
    egs = (egp ** 2 + egq ** 2) ** 0.5
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
    agg = {}  # vcb -> dict

    def slot(v):
        return agg.setdefault(v, {"p": 0.0, "q": 0.0, "loss": 0.0, "maxload": 0.0, "minv": 9.9})

    # 負載
    for idx in net.load.index:
        bname = net.bus.at[net.load.at[idx, "bus"], "name"]
        v = vcb_map.get(bname)
        if v:
            slot(v)["p"] += net.load.at[idx, "p_mw"] * 1000
            slot(v)["q"] += net.load.at[idx, "q_mvar"] * 1000
    # 變壓器損耗 + 負載率
    for idx in net.trafo.index:
        hv = net.bus.at[net.trafo.at[idx, "hv_bus"], "name"]
        v = vcb_map.get(hv)
        if v:
            slot(v)["loss"] += net.res_trafo.at[idx, "pl_mw"] * 1000
            slot(v)["maxload"] = max(slot(v)["maxload"], float(net.res_trafo.at[idx, "loading_percent"]))
    # 電纜損耗 + 負載率 (由線名 VCBx 前綴)
    for idx in net.line.index:
        lname = net.line.at[idx, "name"] or ""
        v = lname.split("_")[0] if lname.startswith("VCB") else None
        if v in agg:
            slot(v)["loss"] += net.res_line.at[idx, "pl_mw"] * 1000
            slot(v)["maxload"] = max(slot(v)["maxload"], float(net.res_line.at[idx, "loading_percent"]))
    # 最低電壓
    for idx in net.bus.index:
        v = vcb_map.get(net.bus.at[idx, "name"])
        vm = net.res_bus.at[idx, "vm_pu"]
        if v and not pd.isna(vm):
            slot(v)["minv"] = min(slot(v)["minv"], float(vm))

    rows = []
    for v in sorted(agg, key=lambda x: int(x.replace("VCB", "")) if x.replace("VCB", "").isdigit() else 99):
        d = agg[v]
        rows.append([v, f"{d['p']:,.1f}", f"{d['q']:,.1f}", f"{d['loss']:.2f}",
                     f"{d['maxload']:.1f}", f"{d['minv']:.4f}"])
    return {"no": "4", "title": "各饋線 (VCB) 摘要", "kind": "table",
            "headers": ["饋線", "負載(kW)", "無功(kVAr)", "損耗(kW)", "最重設備(%)", "最低電壓(pu)"],
            "rows": rows}


def _sec_loads(net):
    """各負載點明細:建物、原始/最終有功、功因、無功、視在 (由大至小)。
    pf/Q/S 為「含同母線並聯電容補償後」之有效值 → 有電容的建物(如 R 館)顯示補償後 pf。"""
    # 母線電容供給無功 (正=容性供給) 與母線負載總 Q (供分攤)
    cap_by_bus, busload_q = {}, {}
    for si in net.shunt.index:
        b = net.shunt.at[si, "bus"]
        cap_by_bus[b] = cap_by_bus.get(b, 0.0) - net.res_shunt.at[si, "q_mvar"] * 1000
    for idx in net.load.index:
        b = net.load.at[idx, "bus"]
        busload_q[b] = busload_q.get(b, 0.0) + net.load.at[idx, "q_mvar"] * 1000

    rows_data = []
    for idx in net.load.index:
        nm = net.load.at[idx, "name"]
        b = net.load.at[idx, "bus"]
        p = net.load.at[idx, "p_mw"] * 1000      # 最終 (已套分散係數)
        q = net.load.at[idx, "q_mvar"] * 1000
        # 扣除同母線電容(按負載 Q 比例分攤)→ 有效無功
        cap = cap_by_bus.get(b, 0.0)
        if cap and busload_q.get(b):
            q = q - cap * (q / busload_q[b])
        s = (p ** 2 + q ** 2) ** 0.5
        pf = p / s if s > 0 else 1.0
        raw = DEFAULT_BUILDING_LOADS.get(nm, {}).get("p_kw", p)
        rows_data.append((nm, BUILDING_MAP.get(nm, ""), raw, p, pf, q, s))

    rows_data.sort(key=lambda r: -r[3])
    tp = sum(r[3] for r in rows_data)
    tq = sum(r[5] for r in rows_data)
    ts = (tp ** 2 + tq ** 2) ** 0.5
    tpf = f"{tp/ts:.2f}" if ts > 0 else "—"

    # 原始(kW)欄只在變壓器法有意義(=分散係數前的平均負載);其餘方法移除
    show_raw = (SYSTEM_LOAD_METHOD == "transformer")
    if show_raw:
        headers = ["負載", "建物", "原始(kW)", "最終(kW)", "pf", "Q(kVAr)", "S(kVA)"]
        rows = [[nm, bld, f"{raw:.1f}", f"{p:.1f}", f"{pf:.2f}", f"{q:.1f}", f"{s:.1f}"]
                for nm, bld, raw, p, pf, q, s in rows_data]
        traw = sum(r[2] for r in rows_data)
        rows.append(["合計", f"{len(rows_data)} 筆", f"{traw:.1f}", f"{tp:.1f}", tpf, f"{tq:.1f}", f"{ts:.1f}"])
        n1 = "最終(kW) = 原始(kW) × 分散係數 (見第 1 章)。"
    else:
        headers = ["負載", "建物", "負載(kW)", "pf", "Q(kVAr)", "S(kVA)"]
        rows = [[nm, bld, f"{p:.1f}", f"{pf:.2f}", f"{q:.1f}", f"{s:.1f}"]
                for nm, bld, raw, p, pf, q, s in rows_data]
        rows.append(["合計", f"{len(rows_data)} 筆", f"{tp:.1f}", tpf, f"{tq:.1f}", f"{ts:.1f}"])
        if SYSTEM_LOAD_METHOD == "ems":
            n1 = "負載(kW) = EMS 各饋線實測按變壓器容量分配之淨台電 (見第 1 章)。"
        elif SYSTEM_LOAD_METHOD == "ems_profile":
            n1 = "負載(kW) = EMS 平日半尖峰占比 × 總負載,再按容量分配 (見第 1 章)。"
        elif SYSTEM_LOAD_METHOD == "xgboost":
            n1 = "負載(kW) = XGBoost 預測各饋線 kW,按容量/VCB3校正分到負載點 (見第 1 章)。"
        elif SYSTEM_LOAD_METHOD == "xgboost_profile":
            n1 = "負載(kW) = XGBoost 預測饋線占比 × 總負載,按容量/VCB3校正分配 (見第 1 章)。"
        elif SYSTEM_LOAD_METHOD == "area":
            n1 = "負載(kW) = 樓地板面積 × 用途密度正規化至總負載 (見第 1 章)。"
        else:
            n1 = "負載(kW):見第 1 章分配方法。"

    notes = [n1,
             "pf / Q(kVAr) / S(kVA) 為「含同母線並聯電容補償後」之有效值 (如 R 館已含其 150kVAr 電容)。"]
    if SYSTEM_LOAD_METHOD in ("ems", "ems_profile", "xgboost", "xgboost_profile"):
        notes.append(f"有 PV 建築(D/L/M/P/Z)之值已扣 PV 出力(容量×{SYSTEM_PV_FACTOR}),故較低。")
    else:
        notes.append("「(未對應)/(歧義)」者沿用舊估值,待真實對應確認後再校正。")
    return {"no": "5", "title": "各負載點明細 (由大至小)", "kind": "table",
            "headers": headers, "rows": rows, "notes": notes}


def _sec_transformers(net):
    summ = sorted(get_transformer_summary(net), key=lambda x: -x["loading_percent"])
    rows = []
    for t in summ:
        rows.append([
            t["trafo_name"], t["hv_bus"], t["lv_bus"],
            f"{t['sn_mva']*1000:.0f}", f"{t['loading_percent']:.1f}",
            f"{t['pl_kw']:.2f}", _trafo_flag(t["loading_percent"]),
        ])
    return {"no": "5", "title": "變壓器負載", "kind": "table",
            "headers": ["變壓器", "HV母線", "LV母線", "容量(kVA)", "負載率(%)", "損耗(kW)", "旗標"],
            "rows": rows}


def _sec_buses(net):
    # Slack 置頂、PV 次之、其餘 PQ 由電壓低至高
    _type_rank = {"Slack": 0, "PV": 1, "PQ": 2}
    summ = sorted(get_bus_summary(net), key=lambda x: (_type_rank.get(x["bus_type"], 9), x["vm_pu"]))
    rows = []
    for b in summ:
        rows.append([
            b["bus_name"], b["bus_type"], f"{b['vn_kv']:.2f}", f"{b['vm_pu']:.4f}",
            f"{b['va_degree']:.2f}", f"{b['p_kw']:.1f}", f"{b['q_kvar']:.1f}",
            _volt_flag(b["vm_pu"]),
        ])
    return {"no": "6", "title": "母線電壓 (Slack/PV 置頂,PQ 由低至高)", "kind": "table",
            "headers": ["母線", "類型", "Vn(kV)", "Vm(pu)", "相角(°)", "P(kW)", "Q(kVAr)", "旗標"],
            "rows": rows}


def _sec_lines(net):
    summ = sorted(get_line_summary(net), key=lambda x: -x["loading_percent"])
    rows = []
    has_unknown = False
    for ln in summ:
        cs = ln.get("cross_section_mm2")
        if ln.get("length_unknown"):
            has_unknown = True
            len_str = "未知*"
        else:
            len_str = f"{ln.get('length_m', 0):.1f}"
        rows.append([
            ln["line_name"], ln["from_bus"], ln["to_bus"],
            f"{cs:.0f}" if cs else "—", len_str,
            f"{ln['loading_percent']:.1f}", f"{ln['p_from_kw']:.1f}",
            f"{ln['q_from_kvar']:.1f}", f"{ln['pl_kw']:.2f}",
        ])
    notes = []
    if has_unknown:
        notes.append("* 長度未知:台電端進線主纜實際長度未知,計算採假設值 (見第 1 章);其壓降/損耗僅供參考。")
    return {"no": "7", "title": "電纜負載 (由重至輕)", "kind": "table",
            "headers": ["電纜", "起點母線", "終點母線", "線徑(mm²)", "長度(m)",
                        "負載率(%)", "P起點(kW)", "Q起點(kVAr)", "損耗(kW)"],
            "rows": rows, "notes": notes}


def _sec_findings(net, stats, conv):
    lines = []
    # 連通性
    if conv.get("isolated_buses"):
        lines.append(f"✗ 孤島母線 {len(conv['isolated_buses'])} 個:{', '.join(conv['isolated_buses'])}")
    if conv.get("unserved_load_kw", 0) > 0:
        lines.append(f"✗ 未供電負載:{conv['unserved_load_kw']:.1f} kW(功率平衡缺口)")
    if not conv.get("isolated_buses") and conv.get("unserved_load_kw", 0) == 0:
        lines.append("✓ 全母線連通,全負載皆供電")
    # 電壓
    if conv["voltage_violations"]:
        lines.append(f"✗ 電壓越限 {len(conv['voltage_violations'])} 處:")
        for v in conv["voltage_violations"]:
            lines.append(f"    - {v['bus']}: {v['vm_pu']:.4f} pu ({v['type']})")
    else:
        lines.append(f"✓ 全母線電壓於 {VOLTAGE_LIMIT_MIN:.2f}–{VOLTAGE_LIMIT_MAX:.2f} pu 限值內")
    # 熱載
    if conv["thermal_violations"]:
        lines.append(f"✗ 設備熱過載 {len(conv['thermal_violations'])} 處:")
        for t in conv["thermal_violations"]:
            lines.append(f"    - {t['equipment']} ({t['type']}): {t['loading_percent']:.1f}%")
    else:
        lines.append("✓ 全設備於熱載限值內")

    lines.append("")
    lines.append("重點發現:")
    total_loss = stats["total_loss_p_kw"] + stats["trafo_loss_p_kw"]
    lines.append(f"  • 系統總損耗 {total_loss:,.1f} kW,占負載 {100*total_loss/stats['total_load_p_kw']:.2f}%"
                 f"(其中變壓器 {stats['trafo_loss_p_kw']:.1f} kW 為主)")
    lines.append(f"  • 最重變壓器負載率 {stats['max_trafo_loading_pct']:.1f}%,"
                 f"最重電纜 {stats['max_line_loading_pct']:.1f}%,整體餘裕充足")
    lines.append(f"  • 電壓最低 {min(stats['min_vm_pu_hv'], stats['min_vm_pu_lv']):.4f} pu")

    lines.append("")
    lines.append("資料警示 (供方法學說明):")
    lines.append(f"  • 變壓器損耗採標準損耗表 (依油/乾式×容量查 P0/Pk 典型值,鐵損~0.2-0.4%),非各台實際銘牌值。")
    lines.append(f"  • 未對應/歧義負載沿用舊估值:{UNMATCHED_LOADS}")
    lines.append(f"  • 模型未含建物:{MISSING_BUILDINGS}")
    return {"no": "8", "title": "合規與重點發現", "kind": "text", "lines": lines}


def _sec_single_line(net):
    """以 ASCII 階層樹繪製系統單線圖，標註各變壓器容量/型式/負載率與 LV 電壓。"""
    # 由結果建立 變壓器名 -> (負載率, LV母線名, LV電壓)
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

    main_vm = bus_vm("TPC_11.4kV")
    lines = []
    lines.append("台電 11.4kV 電源   (Slack, 1.0000 pu)")
    lines.append("   |")
    lines.append("   |  進線主纜 250mm² x3  (長度未知)")
    lines.append("   |")
    lines.append(f"===+=== TPC_11.4kV 受電母線 ({main_vm:.4f} pu) "
                 + "=" * 28)

    for vcb, d in FEEDERS.items():
        # 純電容補償饋線 (如 VCB12)
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
            busname = sub.get("bus")
            trs = sub.get("transformers", [])
            sub_last = (si == len(subs) - 1)
            sb = "`--" if sub_last else "|--"
            lines.append(f"   |    {sb} {busname}")
            cont = "     " if sub_last else "|    "
            for ti, tr in enumerate(trs):
                nm = tr["name"]
                cap = f"{tr.get('capacity')}kVA"
                typ = tr.get("type", "油")
                t_last = (ti == len(trs) - 1)
                tb = "`--" if t_last else "|--"
                head = f"   |    {cont}  {tb} {nm:<11} {cap:<8}{typ}式"
                if tr.get("status") == "disabled":
                    lines.append(f"{head}  [停用]")
                else:
                    ld = tr_load.get(nm, 0.0)
                    vm = tr_vm.get(nm, 0.0)
                    lv = tr_lv.get(nm, "")
                    lines.append(f"{head}  負載 {ld:4.0f}%  -> {lv} {vm:.4f}pu")

    lines.append("")
    lines.append("註: 變壓器負載率 = 視在負載 / 容量;LV 電壓為該變壓器低壓母線電壓。")
    lines.append("    VCB12 為電容補償饋線 (CB_BUS 並聯 600kVAr@13.8kV 電容,於 11.4kV 實供約 409kVAr)。")
    return {"no": "9", "title": "系統單線圖 (ASCII)", "kind": "text", "pre": True, "lines": lines}


# ============================================================================
# 渲染器
# ============================================================================

def _render_markdown(meta, sections) -> str:
    out = [f"# {meta['title']}", "", f"_{meta['subtitle']}_", ""]
    for s in sections:
        out.append(f"## {s['no']}. {s['title']}")
        out.append("")
        if s["kind"] == "kv":
            out.append("| 項目 | 內容 |")
            out.append("|---|---|")
            for k, v in s["rows"]:
                out.append(f"| {k} | {v} |")
        elif s["kind"] == "table":
            out.append("| " + " | ".join(s["headers"]) + " |")
            out.append("|" + "|".join(["---"] * len(s["headers"])) + "|")
            for r in s["rows"]:
                out.append("| " + " | ".join(str(x) for x in r) + " |")
        elif s["kind"] == "text":
            if s.get("pre"):
                out.append("```")
                out.extend(s["lines"])
                out.append("```")
            else:
                for ln in s["lines"]:
                    out.append(ln if ln else "")
        if s.get("post_pre"):
            out.append("")
            out.append("```")
            out.extend(s["post_pre"])
            out.append("```")
        for note in s.get("notes", []):
            out.append("")
            out.append(f"> {note}")
        out.append("")
    out.append("---")
    out.append("_附:同目錄 CSV 檔 — bus_voltage / line_loading / transformer_loading / load_data_")
    return "\n".join(out)


def _render_text(meta, sections) -> str:
    W = 92
    out = ["=" * W, meta["title"], meta["subtitle"], "=" * W, ""]
    for s in sections:
        out.append(f"[{s['no']}] {s['title']}")
        out.append("-" * W)
        if s["kind"] == "kv":
            kw = max(len(k) for k, _ in s["rows"])
            for k, v in s["rows"]:
                out.append(f"  {k:<{kw}}  {v}")
        elif s["kind"] == "table":
            out.extend(_txt_table(s["headers"], s["rows"]))
        elif s["kind"] == "text":
            out.extend(s["lines"])
        if s.get("post_pre"):
            out.append("")
            out.extend(s["post_pre"])
        for note in s.get("notes", []):
            out.append(f"  {note}")
        out.append("")
    out.append("=" * W)
    out.append("附: CSV 檔 — bus_voltage / line_loading / transformer_loading / load_data")
    out.append("=" * W)
    return "\n".join(out)


def _txt_table(headers, rows) -> List[str]:
    """以 CJK 寬度對齊的純文字表格"""
    cols = len(headers)
    widths = [_disp_w(headers[i]) for i in range(cols)]
    for r in rows:
        for i in range(cols):
            widths[i] = max(widths[i], _disp_w(str(r[i])))
    def fmt(cells):
        return "  ".join(_pad(str(c), widths[i]) for i, c in enumerate(cells))
    lines = [fmt(headers), "  ".join("-" * w for w in widths)]
    lines += [fmt(r) for r in rows]
    return lines


def _disp_w(s: str) -> int:
    """顯示寬度: CJK 字元算 2"""
    return sum(2 if ord(ch) > 0x2E80 else 1 for ch in s)


def _pad(s: str, width: int) -> str:
    return s + " " * (width - _disp_w(s))


# ============================================================================
# VCB 對照與旗標
# ============================================================================

def _bus_vcb_map() -> Dict[str, str]:
    """由 FEEDERS 建立 母線名稱 -> VCB 的對照"""
    m = {}
    for vcb, d in FEEDERS.items():
        for sub in d.get("substations", []):
            b = sub.get("bus")
            if b:
                m[b] = vcb
            for tr in sub.get("transformers", []):
                lv = tr.get("lv_bus")
                if lv:
                    m[lv] = vcb
    return m


def _trafo_flag(lp: float) -> str:
    if lp > 100:
        return "過載"
    if lp >= 80:
        return "重載"
    if lp < 15:
        return "輕載"
    return "正常"


def _volt_flag(vm: float) -> str:
    if pd.isna(vm):
        return "孤島"
    if vm < VOLTAGE_LIMIT_MIN or vm > VOLTAGE_LIMIT_MAX:
        return "越限"
    if vm < VOLTAGE_LIMIT_MIN + 0.01:   # 接近下限
        return "偏低"
    if vm > VOLTAGE_LIMIT_MAX - 0.01:   # 接近上限
        return "偏高"
    return "正常"


# ============================================================================
# CSV 導出函數
# ============================================================================

def _export_bus_data(net, output_file):
    pd.DataFrame(get_bus_summary(net)).to_csv(output_file, index=False, encoding="utf-8-sig")


def _export_line_data(net, output_file):
    pd.DataFrame(get_line_summary(net)).to_csv(output_file, index=False, encoding="utf-8-sig")


def _export_transformer_data(net, output_file):
    pd.DataFrame(get_transformer_summary(net)).to_csv(output_file, index=False, encoding="utf-8-sig")


def _export_load_data(net, output_file):
    load_data = []
    for idx in net.load.index:
        bus_idx = net.load.at[idx, "bus"]
        p_kw = net.load.at[idx, "p_mw"] * 1000
        q_kvar = net.load.at[idx, "q_mvar"] * 1000
        s_kva = (p_kw ** 2 + q_kvar ** 2) ** 0.5
        load_data.append({
            "load_name": net.load.at[idx, "name"],
            "bus_name": net.bus.at[bus_idx, "name"],
            "p_kw": round(p_kw, 2),
            "q_kvar": round(q_kvar, 2),
            "s_kva": round(s_kva, 2),
            "pf": round(p_kw / s_kva, 3) if s_kva > 0 else 1.0,
        })
    pd.DataFrame(load_data).to_csv(output_file, index=False, encoding="utf-8-sig")


if __name__ == "__main__":
    from analysis.power_flow import run_s1_baseline_powerflow
    net, results = run_s1_baseline_powerflow()
    files = export_s1_results(net, results, output_dir="results/s1_baseline")
    print(f"\n✓ 共生成 {len(files)} 個文件:")
    for f in files:
        print(f"  - {f}")
