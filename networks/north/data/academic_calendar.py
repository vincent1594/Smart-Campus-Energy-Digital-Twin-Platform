"""學期行事曆特徵 (南台科大, 涵蓋 2023/05-06 訓練/測試期)。

校園逐週負載的真正驅動是行事曆 (上課/放假/考試/暑假),非氣溫
(比較實驗存於 bayesgrid/論文素材/程式/)。本模組把日期映成「校園是否有人/型態」。

已確認 (行政院人事行政總處 2023 國定假日):
  2023-06-22(四) 端午節、2023-06-23(五) 彈性放假 → 放假,校園低載
  2023-06-17(六) 補班補課 → 視同工作日,校園正常載 (修正 is_weekend 誤判)
待南台科大 111-2 行事曆確認 (先給合理預設,確認後改此處即可):
  EXAM_WEEK     期末考週起訖
  SEMESTER_END  學期最後上課日;之後為暑假,校園顯著低載
"""
from __future__ import annotations

import pandas as pd

# 放假日 (國定假日 + 彈性放假):視同假日,校園低載
HOLIDAYS = {
    "2023-04-03",  # 彈性放假 (清明/兒童節連假)
    "2023-04-04",  # 兒童節
    "2023-04-05",  # 清明節
    "2023-06-22",  # 端午節
    "2023-06-23",  # 彈性放假
}
# 補班補課日 (週六照常上課):視同工作日,校園正常載
MAKEUP_WORKDAYS = {
    "2023-03-25",  # 補 4/3 (清明連假)
    "2023-06-17",  # 補 6/23 (端午連假)
}
# 期末考週 (含起訖):學生在校但用電型態改變。空 tuple = 尚未設定。
EXAM_WEEK: tuple[str, str] | tuple = ()        # 例 ("2023-06-12", "2023-06-16")
# 學期最後上課日 (含);之後視為暑假。None = 尚未設定。
SEMESTER_END: str | None = None                # 例 "2023-06-23"


def _d(x) -> str:
    return pd.Timestamp(x).strftime("%Y-%m-%d")


def is_workday(dt) -> bool:
    """有效上班/上課日:補班日 → True;週末或放假 → False;其餘平日 → True。"""
    day = _d(dt)
    if day in MAKEUP_WORKDAYS:
        return True
    if day in HOLIDAYS:
        return False
    return pd.Timestamp(dt).dayofweek < 5


def in_exam_week(dt) -> bool:
    if not EXAM_WEEK:
        return False
    lo, hi = EXAM_WEEK
    return _d(lo) <= _d(dt) <= _d(hi)


def is_post_semester(dt) -> bool:
    """學期結束(暑假)後 → True。未設定 SEMESTER_END 時恆 False。"""
    if SEMESTER_END is None:
        return False
    return _d(dt) > _d(SEMESTER_END)


def calendar_features(dt_series) -> pd.DataFrame:
    """dt Series → 行事曆特徵 DataFrame,index 對齊 0..n-1。"""
    dt = pd.Series(dt_series).reset_index(drop=True)
    return pd.DataFrame({
        "is_workday": dt.apply(is_workday).astype(int),
        "in_exam_week": dt.apply(in_exam_week).astype(int),
        "post_semester": dt.apply(is_post_semester).astype(int),
    })
