"""
XGBoost 饋線負載預測 (5月訓練 / 6月測試)
==========================================
資料: EMS/11205-06(北).xls 逐時 (2023/05-06),11 條饋線 VCB1~VCB11 (VCB12=0)。
特徵: 小時(sin/cos)、星期(sin/cos)、平日/假日 (無氣溫,純時間)。
每饋線各一個 XGBoost regressor,目標 = 該饋線 kW。
訓練 = 2023/05,測試 = 2023/06。

用法:
    python analysis/xgb_forecast.py        # 訓練 + 6月測試評估 + 存模型
之後情境 method="xgboost" 會用存好的模型 predict_feeder_kw(timestamp) 預測。
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EMS_FILE = ROOT / "EMS" / "11205-06(北).xls"
MODEL_FILE = ROOT / "models" / "xgb_feeder_models.pkl"
FEEDER_COLS = [f"VCB{i}" for i in range(1, 12)]   # VCB12=0 不預測


def _load_ems():
    sys.path.insert(0, str(ROOT))
    from data.ems_loads import _read_ems   # 重用穩健讀取器
    return _read_ems()


def _features(dt):
    """dt: pandas datetime Series → 特徵 DataFrame。"""
    h = dt.dt.hour
    dow = dt.dt.dayofweek
    return pd.DataFrame({
        "hour_sin": np.sin(2 * np.pi * h / 24),
        "hour_cos": np.cos(2 * np.pi * h / 24),
        "dow_sin": np.sin(2 * np.pi * dow / 7),
        "dow_cos": np.cos(2 * np.pi * dow / 7),
        "is_weekend": (dow >= 5).astype(int),
        "hour": h.astype(int),
        "dow": dow.astype(int),
    })


def train_and_evaluate(save=True):
    """5月訓練、6月測試;印各饋線 MAE/MAPE/R²,存模型。回傳 {feeder: model}。"""
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, r2_score

    t = _load_ems()
    train = t[t["dt"].dt.month == 5]
    test = t[t["dt"].dt.month == 6]
    Xtr, Xte = _features(train["dt"]), _features(test["dt"])

    print(f"訓練={len(train)}筆(5月)  測試={len(test)}筆(6月)")
    print(f"{'饋線':<7}{'MAE(kW)':>9}{'MAPE%':>8}{'R2':>7}")
    print("-" * 31)
    models, preds = {}, {}
    for c in FEEDER_COLS:
        ytr, yte = train[c].values, test[c].values
        m = xgb.XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                             subsample=0.9, colsample_bytree=0.9, random_state=0)
        m.fit(Xtr, ytr)
        p = np.clip(m.predict(Xte), 0, None)
        models[c], preds[c] = m, p
        mae = mean_absolute_error(yte, p)
        mape = np.mean(np.abs((yte - p) / np.clip(np.abs(yte), 1e-6, None))) * 100
        print(f"{c:<7}{mae:>9.1f}{mape:>8.1f}{r2_score(yte, p):>7.2f}")

    ytot = test[FEEDER_COLS].sum(axis=1).values
    ptot = sum(preds[c] for c in FEEDER_COLS)
    print("-" * 31)
    print(f"總量 6月: 實際均 {ytot.mean():.0f} / 預測均 {ptot.mean():.0f} kW "
          f"(MAE {mean_absolute_error(ytot, ptot):.0f})")
    print("⚠ 無氣溫特徵;6月較熱,預測可能系統性偏低。")

    if save:
        import joblib
        MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(models, MODEL_FILE)
        print(f"✓ 模型已存: {MODEL_FILE}")
    return models


def predict_feeder_kw(timestamp):
    """用訓練好的模型預測某時刻各饋線 kW → {VCBx: kw}。無模型則自動先訓練。"""
    import joblib
    if not MODEL_FILE.exists():
        train_and_evaluate(save=True)
    models = joblib.load(MODEL_FILE)
    X = _features(pd.Series([pd.Timestamp(timestamp)]))
    out = {c: float(max(0.0, models[c].predict(X)[0])) for c in FEEDER_COLS}
    out["VCB12"] = 0.0
    return out


def compute_xgb_loads(timestamp, pv_factor=0.8):
    """XGBoost 法(絕對): 預測各饋線 kW → 按容量/VCB3校正分到負載點 (考慮 PV)。"""
    from data.ems_loads import _distribute, _calib_weights
    from data.pv import pv_output_by_load
    return _distribute(predict_feeder_kw(timestamp), pv_output_by_load(pv_factor), _calib_weights())


def compute_xgb_profile_loads(total_kw, timestamp, pv_factor=0.8):
    """XGBoost 占比法: 用預測各饋線占比 × 指定總量 → 分到負載點 (保留情境總量)。"""
    from data.ems_loads import _distribute, _calib_weights
    from data.pv import pv_output_by_load
    pred = predict_feeder_kw(timestamp)
    tot = sum(pred.values())
    feeder_kw = {c: (total_kw * pred[c] / tot if tot else 0.0) for c in pred}
    return _distribute(feeder_kw, pv_output_by_load(pv_factor), _calib_weights())


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    sys.path.insert(0, str(ROOT))
    train_and_evaluate()
