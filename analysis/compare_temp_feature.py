"""特徵方案前後對比 —— 純時間 / +氣溫 / +學期行事曆。

結論摘要 (5月訓練→6月測試):
  純時間   每個週一同時段預測完全相同 (即「每週都一樣」),且抓不到 6月學期末降載。
  +氣溫    逐週不同但更差 (氣溫對本校園 corr≈±0.1 且月間變號,非驅動因子)。
  +行事曆  以「校園是否有人/考試/暑假」為特徵,才是真驅動 → 逐週不同且應更準。
用法:
    python analysis/compare_temp_feature.py
"""
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, r2_score

from analysis.xgb_forecast import FEEDER_COLS, _attach_temp, _features, _load_ems
from data.academic_calendar import calendar_features

_PARAMS = dict(n_estimators=300, max_depth=4, learning_rate=0.05,
               subsample=0.9, colsample_bytree=0.9, random_state=0)


def _build(df, kind):
    """依方案組特徵 DataFrame。kind: time | temp | calendar。"""
    if kind == "temp":
        return _features(df["dt"], df["temp_mean"])
    X = _features(df["dt"])
    if kind == "calendar":
        X = pd.concat([X, calendar_features(df["dt"])], axis=1)
    return X


def _fit_total(Xtr, Xte, train):
    ptot = np.zeros(len(Xte))
    for c in FEEDER_COLS:
        m = xgb.XGBRegressor(**_PARAMS)
        m.fit(Xtr, train[c].values)
        ptot += np.clip(m.predict(Xte), 0, None)
    return ptot


def main():
    t = _attach_temp(_load_ems())
    train = t[t["dt"].dt.month == 5].reset_index(drop=True)
    test = t[t["dt"].dt.month == 6].reset_index(drop=True)
    ytot = test[FEEDER_COLS].sum(axis=1).values

    print(f"測試期 6月 總量逐時 {len(test)} 點\n")
    print(f"{'方案':<14}{'MAE(kW)':>10}{'MAPE%':>9}{'R²':>8}")
    print("-" * 41)
    for kind, label in [("time", "純時間"), ("temp", "+氣溫"), ("calendar", "+行事曆")]:
        ptot = _fit_total(_build(train, kind), _build(test, kind), train)
        mae = mean_absolute_error(ytot, ptot)
        mape = np.mean(np.abs((ytot - ptot) / np.clip(np.abs(ytot), 1e-6, None))) * 100
        print(f"{label:<14}{mae:>10.1f}{mape:>9.1f}{r2_score(ytot, ptot):>8.2f}")

    from data.academic_calendar import EXAM_WEEK, SEMESTER_END
    if not EXAM_WEEK or SEMESTER_END is None:
        print("\n※ 行事曆僅含已確認的端午連假/補班修正;"
              "期末考週與學期結束日尚未設定,設定後 +行事曆 還會更準。")


if __name__ == "__main__":
    main()
