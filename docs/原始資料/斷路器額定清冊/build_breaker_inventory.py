"""把斷路器額定清冊 (breaker_inventory.md) 轉成 Excel(多分頁)+ CSV。

來源:研究資料/1.高壓單線圖/ 30 張竣工單線圖。
輸出:本資料夾的 斷路器額定清冊.xlsx 及同名各分頁 CSV(UTF-8-BOM,Excel 不亂碼)。
"""
from pathlib import Path
import pandas as pd

OUT = Path(__file__).parent

# ── 分頁1:受電/總站(含 VCB/GCB,kA 校核對象)──────────────────────
受電總站 = [
    # 站名, 受電來源, 主開關, 饋線VCB, 遮斷kA, 連續A, 備註
    ["X棟新設總變電站", "台電TPC / MOF", "MVCB 1250A", "VCB1~14", "16(主MVCB 25)", "630(主1250)", "= 模型受電點;饋線VCB=630A/16KA、主MVCB=1250A/25KA;VCB14=SP備用;附50/51,79電驛"],
    ["J棟總變電站(105.6遷X棟)", "台電11.4kV / MOF", "MGCB 630A", "GCB1~4,6+VCB5+LBS1/3/5", "16", "630", "既設已遷X棟;GCB3→K、GCB1→N、GCB6→T/V、VCB5→電容"],
    ["W棟(生活機能館)", "X棟 VCB10", "MVCB6 630A", "VCB6-1~6-4", "16", "630", "TRS1/2=1500、TRS3=750、TRS4=500;LV標IC≥40kA"],
    ["I棟", "X棟 VCB11", "MVCB 630A", "VCB1~4+LBS-SC", "16", "630", "TRS1/2=1500乾、TRS3/4=750乾;LBS-SC接HV電容"],
    ["E棟", "(舊)全校總站 VCB3", "MVCB 630A", "VCB1~5", "25", "630", "TR1~4=1000、TR5=750;MR盤ACB2500A;有發電機ATS"],
    ["T棟乙配變電站", "J棟 VCB6", "MVCB 630A", "VCB1(停用)、VCB3", "25", "630", "TR1250+TR1500(停用);恒揚電機"],
    ["T棟甲配變電站", "乙配 LBS2", "VCB2(停用)", "VCB2", "25", "630", "TR1250(停用);整站停用;發電機ATS2 800A"],
    ["N棟", "J棟 GCB→LBS", "GCB1/GCB2", "GCB×2", "12.5", "630", "DS600A;PF63A;TR400;送三連堂"],
    ["U棟主變電站(宿舍區)", "台電TPC / MOF", "MVCB 600A", "VCB1~5+VCBA", "16", "630", "送第一/第六宿舍、SP資訊大樓、運動館;南區"],
    ["O棟高壓總配電站(宿舍區)", "台電TPC / MOF", "MVCB 600A", "VCB1~6", "16", "630", "送第一/第六宿舍、SP、高齡大樓O;站內無TR;南區"],
    ["V棟", "超高壓站 新設DS", "MVCB 630A", "VCB#A、VCB#B", "16", "630", "TR1=600乾、TR2=750乾;無LBS"],
    ["六舍變電站", "一舍 VCB2", "MVCB 630A", "VCB1~4(KOYO)", "16", "630", "TR#A/C/D=1000、TR#B=750;發電機×2"],
    ["一舍總變電站(宿舍區)", "台電 MOF / 分界點", "MVCB 800A", "VCB1~5", "16※", "630", "送一宿/研究生、六宿、E棟、SP、SC;主800A;DS630A"],
    ["K棟(K1變電站)", "J棟 GCB3", "CB盤 VCB", "1×VCB(12kV)", "16?※", "630", "12kV系統;其餘LBS1~5;K2戶外站全LBS"],
    ["L棟", "K棟 K1CB", "MAIN盤 VCB", "1×VCB(12kV)", "未標", "630", "LBS+VCB串接;遮斷kA未標"],
]
受電總站_cols = ["站名", "受電來源", "主開關", "饋線VCB", "遮斷kA", "連續A", "備註"]

# ── 分頁2:末端建築站(只有 LBS,無 kA;校核A 用 LV 主開關)──────────
末端站 = [
    # 站名, 受電來源, 高壓開關, 變壓器kVA, LV主開關
    ["A棟", "J棟 LBS1", "LBS 630A", "TR 200", "MP 3P400A×2 / ML 3P150A"],
    ["B棟", "A棟 LBS1", "LBS 630A", "TR 500 (+站內200降壓)", "MPB1500A / MPA1000A / MPC600A"],
    ["C棟·D棟(共站)", "J棟 LBS3", "LBS 630A×2 + LA", "TR 300", "分歧3P600A×2 / 300A"],
    ["F棟", "三連堂 DS", "LBS 630A×7", "TR 250/400/500 (+200降壓)", "MP1600A / 1200A"],
    ["G棟西面", "西淮館 LBS", "LBS 630A In:80A", "TR 300 (+100降壓)", "MP 3P1000A"],
    ["M棟", "小木屋 LBS", "LBS 630A In:40A", "TR 750", "MP/ML ACB1600A"],
    ["P棟", "J棟 LBS1", "LBS 630A", "TR 400", "ACB 3P1000A"],
    ["Q·R·R1棟", "K棟 K2戶外 LBS3", "LBS 630A", "TR 600", "MP ACB1600A"],
    ["S棟", "J棟 LBS3", "LBS 630A×4", "TR1 750 / TR2 400", "MP1200A / ML1200A"],
    ["三舍", "小木屋 LBS", "LBS 630A×3 + LA", "TR1 400 / TR2 300", "MP1 1000A / MR 1000A"],
    ["三連堂", "N棟 PT", "DS + LBS", "TR 500 (+100降壓)", "3P1600A"],
    ["西淮館", "J棟 GCB2", "LBS 630A×2", "TR 200 (+1φ50降壓)", "MPE 3P600A"],
    ["一舍更新(一舍變電站)", "一舍總站 VCB", "LBS 630A×3", "TR 300/400/400", "MP1 1200A / ML 1200A"],
]
末端站_cols = ["站名", "受電來源", "高壓開關", "變壓器kVA", "LV主開關"]

# ── 分頁3:X棟總站 VCB ↔ 模型 FEEDERS 對應 ──────────────────────────
對應表 = [
    ["VCB1", "N,Y,F / 文化走廊 / O東", "2400", "VCB1(N_BUS,Y_BUS,F_BUS,G1_BUS)"],
    ["VCB2", "M,Z,G西 / H3", "1950", "VCB2(Z_BUS,M_BUS,G2_BUS,H3_BUS)"],
    ["VCB3", "K,L,Q,R", "3200", "VCB3(K_BUS,R_BUS,L_BUS)"],
    ["VCB4", "P / X", "400", "VCB4(P_BUS)"],
    ["VCB5", "A,B", "700", "VCB5(A_BUS,B_BUS)"],
    ["VCB6", "T(1250)+V(1350)", "2600", "VCB6(T_BUS,V_BUS)"],
    ["VCB7", "C,D", "300", "VCB7(CD_BUS)"],
    ["VCB8", "S", "1150", "VCB8(S_BUS)"],
    ["VCB9", "J", "500", "VCB9(J_BUS)"],
    ["VCB10", "W(生活機能館)", "—", "VCB10(W_BUS)"],
    ["VCB11", "I(本次工程)", "—", "VCB11(I_BUS)"],
    ["VCB12~14", "電容補償 / 預留 / SP", "—", "VCB12(電容饋線);13/14模型未建"],
]
對應表_cols = ["X棟VCB", "圖上去向", "聚合kVA", "模型FEEDERS對應"]

# ── 分頁4:待補資料 ───────────────────────────────────────────────
待補 = [
    ["1", "台電分界點短路容量 MVA(ext_grid.s_sc_max_mva)", "台電受電/併聯審查文件,圖上無;暫用 16kA×11.4kV×√3≈316MVA 為上限"],
    ["2", "一舍總站/K棟/L棟 VCB 的 kA", "圖面未逐櫃印或疑誤標,待現場銘牌複核"],
    ["3", "變壓器油/乾式", "多數圖未標;以現有模型 type 欄與現場銘牌為準"],
]
待補_cols = ["項次", "缺什麼", "說明"]

sheets = {
    "受電總站(kA校核)": pd.DataFrame(受電總站, columns=受電總站_cols),
    "末端站(只有LBS)": pd.DataFrame(末端站, columns=末端站_cols),
    "X棟VCB對應模型": pd.DataFrame(對應表, columns=對應表_cols),
    "待補資料": pd.DataFrame(待補, columns=待補_cols),
}

# 寫 Excel(多分頁,自動調欄寬)
xlsx_path = OUT / "斷路器額定清冊.xlsx"
with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
    for name, df in sheets.items():
        df.to_excel(writer, sheet_name=name, index=False)
        ws = writer.sheets[name]
        for col_cells in ws.columns:
            width = max(len(str(c.value or "")) for c in col_cells)
            # 中文字較寬,粗估每字 ~1.8 倍,並設上下限
            ws.column_dimensions[col_cells[0].column_letter].width = min(60, max(10, width * 1.8))

# 各分頁另存 CSV(UTF-8-BOM)
for name, df in sheets.items():
    df.to_csv(OUT / f"斷路器額定清冊_{name}.csv", index=False, encoding="utf-8-sig")

print(f"[OK] 已輸出:{xlsx_path.name}（{len(sheets)} 分頁)")
for name, df in sheets.items():
    print(f"  - {name}: {len(df)} 列  → 斷路器額定清冊_{name}.csv")
