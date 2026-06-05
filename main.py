"""
MAIN — 校園 11.4kV 配電系統 多情境潮流分析主程式

用法:
    python main.py              # 執行全部情境
    python main.py S1.2         # 只執行指定情境
    python main.py S1 S1.1      # 執行多個指定情境

情境定義於 data/parameters.py 的 SCENARIOS。
每個情境結果輸出至 results/<情境>/。
"""

import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from data.parameters import SCENARIOS


def main():
    requested = [a.strip() for a in sys.argv[1:]]
    if requested:
        targets = [s for s in requested if s in SCENARIOS]
        for u in [s for s in requested if s not in SCENARIOS]:
            print(f"[略過] 未知情境: {u}  (可用: {', '.join(SCENARIOS)})")
    else:
        targets = list(SCENARIOS)

    if not targets:
        print("沒有可執行的情境。")
        return 1

    print("=" * 72)
    print(f"多情境潮流分析 — 將執行: {', '.join(targets)}")
    print("=" * 72)

    runner = ROOT / "run_s1_baseline.py"
    results = []
    for sc in targets:
        info = SCENARIOS[sc]
        load = info["load_kw"]
        load_str = f"{load:.0f} kW" if load else "未縮放"
        print(f"\n>>> 情境 {sc}  ({info['period']}, {load_str})")
        r = subprocess.run([sys.executable, str(runner), sc])
        results.append((sc, r.returncode == 0))

    print("\n" + "=" * 72)
    print("執行總結:")
    for sc, ok in results:
        print(f"  {'[OK]  ' if ok else '[FAIL]'} {sc:<6} → results/{sc}/")
    print("=" * 72)
    return 0 if all(ok for _, ok in results) else 1


if __name__ == "__main__":
    sys.exit(main())
