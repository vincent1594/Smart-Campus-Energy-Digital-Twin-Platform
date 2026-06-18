"""營繕組 需量 / 契約容量 設定與計費規則。

平台其餘部分是「物理模型真相」(data/、models/);本檔是「營運業務參數」,
由營繕組依台電合約填寫,故獨立於物理模型之外。

台電高壓「經常契約」超約計費 (用戶用電規則):
    最高需量超出契約容量者,
      超約在「契約容量 10% 以內」之部分 → 該部分基本電費按 2 倍計收;
      超約「超過 10%」之部分          → 該部分基本電費按 3 倍計收。
此處以「超約 kW × 每月基本電費單價 × 倍數」估算單月超約罰款 (NT$)。
"""
from __future__ import annotations

# 契約容量 (kW) —— 北電錶受電站「經常契約」。營繕組依台電合約調整。
CONTRACT_CAPACITY_KW = 3250.0

# 經常契約基本電費單價 (NT$ / kW / 月) —— 高壓用戶,依台電電價表。
DEMAND_CHARGE_NT_PER_KW = 223.6

# 需量利用率達此比例即提醒「接近契約容量」(尚未超約)。
DEMAND_WARN_RATIO = 0.90


def estimate_overshoot_penalty(
    contract_kw: float, peak_kw: float, rate: float = DEMAND_CHARGE_NT_PER_KW
) -> float:
    """估算單月超約罰款 (NT$)。未超約回 0。

    回傳的是「超約部分的額外基本電費」(2 倍 / 3 倍級距),非整月電費。
    """
    excess = max(0.0, peak_kw - contract_kw)
    if excess <= 0 or contract_kw <= 0:
        return 0.0
    tier1 = min(excess, 0.10 * contract_kw)        # 超約 10% 以內 → 2 倍
    tier2 = max(0.0, excess - 0.10 * contract_kw)  # 超約超過 10% → 3 倍
    return tier1 * rate * 2.0 + tier2 * rate * 3.0


def demand_status(utilization_percent: float) -> str:
    """OK / WARNING(接近契約) / EXCEED(超約)。"""
    if utilization_percent > 100.0:
        return "EXCEED"
    if utilization_percent >= DEMAND_WARN_RATIO * 100.0:
        return "WARNING"
    return "OK"


# ============================================================================
# 台電「高壓三段式時間電價」—— 時段窗格 + 預設費率
# ============================================================================
# 結構 (台電用電規則):
#   夏月 6/1–9/30：尖峰 / 半尖峰 / 離峰 三段。
#   非夏月 10/1–5/31：僅 半尖峰 / 離峰 (無尖峰)。
#   週日及離峰日全日離峰;週六無尖峰 (僅半尖峰/離峰)。
# ★ 時段窗格依台電公告編碼;費率為「可編輯預設值」,營繕組請依最新電價表/自家合約校正。
PEAK = "尖峰"
MID = "半尖峰"
OFF = "離峰"

# 預設費率 (NT$);流動電費 = NT$/kWh,基本電費 = NT$/kW/月。皆為預設值,待校正。
DEFAULT_TARIFF = {
    "summer": {PEAK: 5.01, MID: 3.12, OFF: 1.85, "basic": 223.6},   # 夏月
    "nonsummer": {MID: 2.95, OFF: 1.78, "basic": 166.9},            # 非夏月 (無尖峰)
}

WINDOW_NOTE = (
    "夏月(6/1–9/30) 平日 尖峰16–22、半尖峰09–16及22–24、離峰00–09;"
    "夏月週六 半尖峰09–24、離峰00–09。"
    "非夏月(10/1–5/31) 平日/週六 半尖峰06–11及14–24、離峰其餘(無尖峰)。"
    "週日及離峰日全日離峰。時段依台電公告,未計國定假日。"
)


def is_summer(month: int) -> bool:
    """夏月 = 6/1–9/30。"""
    return 6 <= month <= 9


def classify_period(month: int, weekday: int, hour: int) -> str:
    """回傳該時刻計費時段:尖峰/半尖峰/離峰。weekday: 0=週一 … 6=週日。"""
    if weekday == 6:                      # 週日(離峰日)→ 全日離峰
        return OFF
    summer = is_summer(month)
    saturday = weekday == 5
    if summer:
        if not saturday:                  # 夏月平日:三段
            if 16 <= hour < 22:
                return PEAK
            if (9 <= hour < 16) or (22 <= hour < 24):
                return MID
            return OFF
        # 夏月週六:半尖峰 09–24,其餘離峰 (無尖峰)
        return MID if 9 <= hour < 24 else OFF
    # 非夏月(平日/週六):半尖峰 06–11 及 14–24,其餘離峰 (無尖峰)
    if (6 <= hour < 11) or (14 <= hour < 24):
        return MID
    return OFF
