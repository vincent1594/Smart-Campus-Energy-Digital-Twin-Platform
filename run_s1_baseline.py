"""
S1 Baseline 執行主程式
執行完整的潮流計算和報告生成流程

用法:
    python run_s1_baseline.py            # 預設情境 S1
    python run_s1_baseline.py S1.1       # 指定情境 (見 parameters.SCENARIOS)
"""

import os
import sys
from pathlib import Path

# 命令列指定情境 → 設環境變數 (須在匯入 data.parameters 之前)
if len(sys.argv) > 1:
    os.environ["BAYESGRID_SCENARIO"] = sys.argv[1].strip()

# Windows 主控台預設 cp950 無法輸出 ✓/⚠ 等符號，強制改用 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# 添加當前目錄到 Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# 使用絕對導入
from models.network_builder import build_network_s1_baseline
from analysis.power_flow import run_s1_baseline_powerflow
from analysis.results_export import export_s1_results
from data.parameters import ACTIVE_SCENARIO, SYSTEM_PEAK_PERIOD, SYSTEM_COINCIDENT_PEAK_KW


def main():
    """
    主執行函數
    """
    print("\n" + "="*80)
    print(f"情境 {ACTIVE_SCENARIO} - 校園電力系統潮流分析")
    print(f"負載情境: {SYSTEM_PEAK_PERIOD} ({SYSTEM_COINCIDENT_PEAK_KW:.0f} kW)")
    print("="*80 + "\n")
    
    try:
        # 1. 構建網路
        print("[1/3] 構建 PandaPower 網路...")
        net = build_network_s1_baseline()
        print("[OK] 網路構建完成\n")
        
        # 2. 運行潮流計算
        print("[2/3] 運行牛頓-拉夫遜潮流計算...")
        net, results = run_s1_baseline_powerflow(net=net, verbose=True)
        print("[OK] 潮流計算完成\n")
        
        # 3. 導出結果
        print("[3/3] 導出結果到文件...")
        output_dir = str(Path(__file__).parent / "results" / ACTIVE_SCENARIO)
        files = export_s1_results(net, results, output_dir=output_dir)
        print("[OK] 結果導出完成\n")
        
        # 打印輸出文件清單
        print("Generated files:")
        for f in files:
            print(f"  [+] {f}")
        
        print("\n" + "="*80)
        print(f"情境 {ACTIVE_SCENARIO} ANALYSIS COMPLETED")
        print("="*80 + "\n")
        
        return 0
        
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
