"""永康站 (467420) 日氣溫 —— 供需量預測加入氣溫特徵。

資料來源: 中央氣象署 CODiS 月報表 CSV,檔名 EMS/467420-YYYY-MM.csv。
每列一天;欄位(位置固定): 0=日, 7=日均溫(℃), 8=最高溫(℃)。
第 1 列為中文欄名、第 2 列為英文欄名 (ObsTime...),資料由第 3 列起。
"""
from __future__ import annotations

import glob
import re
from pathlib import Path

import pandas as pd

_DIR = Path(__file__).resolve().parent.parent / "EMS"
_GLOB = "467420-*.csv"
_YM_RE = re.compile(r"(\d{4})-(\d{2})$")


def daily_temps() -> pd.DataFrame:
    """所有月報表合併 → DataFrame[date, temp_mean, temp_max] (依日期排序)。"""
    frames = []
    for f in sorted(glob.glob(str(_DIR / _GLOB))):
        m = _YM_RE.search(Path(f).stem)
        if not m:
            continue
        year, month = int(m.group(1)), int(m.group(2))
        raw = pd.read_csv(f, header=0, encoding="utf-8-sig", dtype=str)
        raw = raw[raw.iloc[:, 0] != "ObsTime"]                 # 去英文欄名列
        day = pd.to_numeric(raw.iloc[:, 0], errors="coerce")
        sub = pd.DataFrame({
            "day": day,
            "temp_mean": pd.to_numeric(raw.iloc[:, 7], errors="coerce"),
            "temp_max": pd.to_numeric(raw.iloc[:, 8], errors="coerce"),
        }).dropna(subset=["day"])
        sub["date"] = pd.to_datetime(dict(
            year=year, month=month, day=sub["day"].astype(int)))
        frames.append(sub[["date", "temp_mean", "temp_max"]])
    if not frames:
        raise FileNotFoundError(f"找不到氣溫月報表: {_DIR / _GLOB}")
    out = pd.concat(frames, ignore_index=True).sort_values("date").reset_index(drop=True)
    # 缺值 (--/空) 以鄰日線性內插補回,避免 NaN 進模型
    out["temp_mean"] = out["temp_mean"].interpolate().ffill().bfill()
    out["temp_max"] = out["temp_max"].interpolate().ffill().bfill()
    return out


def temp_lookup() -> dict[str, float]:
    """{ 'YYYY-MM-DD' -> 日均溫 } 供預測時依日期對齊。"""
    df = daily_temps()
    return {d.strftime("%Y-%m-%d"): float(t)
            for d, t in zip(df["date"], df["temp_mean"])}


def mean_temp() -> float:
    """全期日均溫平均 —— 預測日期落在資料範圍外時的後備溫度。"""
    return float(daily_temps()["temp_mean"].mean())


if __name__ == "__main__":
    df = daily_temps()
    print(df.to_string(index=False))
    print(f"\n共 {len(df)} 天;日均溫 {df['temp_mean'].min():.1f}~{df['temp_mean'].max():.1f}℃ "
          f"(平均 {df['temp_mean'].mean():.1f});最高溫 {df['temp_max'].max():.1f}℃")
