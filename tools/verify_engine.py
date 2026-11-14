"""驗收:包覆真實模型 -> 解析 domain -> 對照表正確。

執行 (在 repo 根目錄,用全域 python):
    python -m tools.verify_engine          # 南北兩網都驗
    python -m tools.verify_engine north    # 只驗指定電網
"""
import sys

from networks.registry import PROVIDERS
from webapi.engine import build_base


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    for nid in (sys.argv[1:] or list(PROVIDERS)):
        print(f"\n################ 電網: {nid} ################")
        verify(nid)


def verify(network_id: str) -> None:
    base = build_base(PROVIDERS[network_id])
    m = base.model
    s = base.results["system_stats"]
    conv = base.results["convergence"]

    print("=== 解析出的 domain 實體 ===")
    print(f"  VCB     : {len(m.vcbs)}")
    print(f"  Feeder  : {len(m.feeders)}")
    print(f"  變壓器  : {len(m.transformers)}")
    print(f"  建築/負載: {len(m.buildings)}")

    print("\n=== index 對照表 ===")
    print(f"  trafo_by_name: {len(base.index.trafo_by_name)}")
    print(f"  line_by_name : {len(base.index.line_by_name)}")
    print(f"  load_by_name : {len(base.index.load_by_name)}")

    print("\n=== base 潮流 (取自既有 power_flow) ===")
    print(f"  狀態        : {conv['status']}")
    print(f"  總負載      : {s['total_load_p_kw']:.1f} kW")
    print(f"  最大變壓器  : {s['max_trafo_loading_pct']:.1f} %")
    print(f"  最大電纜    : {s['max_line_loading_pct']:.1f} %")
    print(f"  最低電壓(LV): {s['min_vm_pu_lv']:.4f} pu")

    print("\n=== 抽樣:某棟建築的所屬鏈 ===")
    b = m.buildings[0]
    tr = m.transformer(b.transformer_id)
    fd = m.feeder(tr.feeder_id) if tr and tr.feeder_id else None
    vcb = m.vcb(tr.vcb_id) if tr else None
    print(f"  {b.id} ({b.load_kw}kW) -> 變壓器 {tr.name}({tr.capacity_kva}kVA) "
          f"-> 饋線 {fd.id if fd else '(開關耦合)'} -> {vcb.name if vcb else '?'}")

    # 對照既有摘要,確認變壓器數一致
    print(f"\n  net.trafo 台數={len(base.net.trafo)} (含停用前; 解析後={len(m.transformers)})")


if __name__ == "__main__":
    main()
