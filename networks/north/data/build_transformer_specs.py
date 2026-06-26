"""把「各站變壓器規格容量資料.xlsx」轉成 JSON 規格表(供平台唯讀核對用)。

Excel 為轉置表:每欄一台變壓器,每列一個規格欄位,6 台一個 block 垂直堆疊。
產生 webapi/data/transformer_specs.json(忠實原樣,不對應模型,供營繕組核對)。

更新規格時重跑:python data/build_transformer_specs.py
"""
from __future__ import annotations

import glob
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "webapi" / "data" / "transformer_specs.json"

# Excel 中文欄名 → JSON 英文鍵
LABELS = {
    "序號": "seq",
    "建築物名稱": "building",
    "變壓器編號": "tag",
    "廠牌": "brand",
    "製造年份": "year",
    "變壓器容量": "capacity_kva",
    "變壓器型式(註1)": "trafo_type",
    "一次側電壓": "hv_kv",
    "二次側電壓": "lv_v",
    "迴路名稱": "circuit",
    "負載概述": "load_desc",
    "效率η": "efficiency",
    "變壓器溫度": "temperature_c",
    "一次側實際電壓": "hv_actual_kv",
    "二次側實際電壓": "lv_actual_v",
    "負載電流": "load_current_a",
    "功因": "power_factor",
    "平均負載": "avg_load_kw",
    "負載率": "load_ratio",
    "功因自動調整器": "pf_regulator",
    "裝置電容器量": "capacitor_kvar",
}
NUMERIC = {  # 鍵 → 小數位數(None=整數)
    "capacity_kva": None, "efficiency": 2, "temperature_c": 0,
    "load_current_a": 0, "power_factor": 2, "avg_load_kw": 1, "capacitor_kvar": 0,
}


def _cell(v) -> str:
    return str(v).strip() if pd.notna(v) else ""


def _num(s: str, ndigits):
    try:
        f = float(s)
        return int(round(f)) if ndigits is None else round(f, ndigits)
    except (ValueError, TypeError):
        return None


def main() -> None:
    f = glob.glob(str(ROOT / "data" / "*變壓器*.xlsx"))[0]
    df = pd.read_excel(f, header=None)

    def rows(zh: str):
        return [[_cell(r[c]) for c in range(5, 11)]
                for _, r in df.iterrows() if str(r[2]).strip() == zh]

    data = {en: rows(zh) for zh, en in LABELS.items()}
    nblocks = len(data["building"])

    recs = []
    for bi in range(nblocks):
        for c in range(6):
            building = data["building"][bi][c] if bi < len(data["building"]) else ""
            if building in ("", "nan"):
                continue
            rec = {}
            for en in LABELS.values():
                val = data[en][bi][c] if bi < len(data[en]) else ""
                if en in NUMERIC:
                    rec[en] = _num(val, NUMERIC[en])
                elif en == "load_ratio":
                    n = _num(val, 3)
                    rec["load_ratio_percent"] = round(n * 100, 1) if n is not None else None
                else:
                    rec[en] = val
            recs.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(recs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"寫入 {OUT} :{len(recs)} 台變壓器")


if __name__ == "__main__":
    main()
