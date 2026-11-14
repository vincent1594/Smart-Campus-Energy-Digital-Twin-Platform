"""
XGBoost 饋線負載預測 —— 11 條饋線 VCB1~VCB11 各一個 regressor (VCB12=0 不建模)
==============================================================================
資料: EMS 逐時 (2023/03-06),11 條饋線 VCB1~VCB11。**原始電錶即為逐時解析度**,
無 15 分鐘資料,故所有模型與下游尖峰需量皆為「逐時平均」口徑 (見下方「解析度」)。

本檔含三個彼此獨立的模型,服務不同用途 —— 引用數據時務必分清:

  模型            訓練/驗證            特徵                        誰在用
  ────────────────────────────────────────────────────────────────────────
  MODEL_FILE      5月訓練 / 6月測試    時間 (小時/星期 sin/cos)    情境 S2、EUI、帳單
  (train_and_evaluate)                                            compute_xgb_loads
  MODEL_FILE_CAL  全期(5+6月) + CV     時間 + 學期行事曆           lag 缺值時的退回
  (train_calendar_model)                                          predict_day_feeders
  MODEL_FILE_LAG  3-5月訓練 / 6月驗證  時間 + 行事曆 + lag24/168   需量預測 API
  (train_lag_model)                                               demand_service

氣溫: _features() 雖有 temp= 參數,production 呼叫端一律不傳。實測氣溫對本校園
總量幾無預測力,加入反而升高測試誤差 (見 analysis/compare_temp_feature.py)。

解析度: 預測格點為每日 24 個整點。台電契約容量以 15 分鐘需量計費,逐時平均會
系統性低估 15 分鐘尖峰 → demand_service 的超約罰款估計偏保守 (偏低)。無 15 分鐘
原始資料可修正此點。

用法:
    python analysis/xgb_forecast.py        # 訓練基礎模型 + 6月測試評估 + 存模型
之後情境 method="xgboost" 會用存好的模型 predict_feeder_kw(timestamp) 預測。
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MODEL_FILE = ROOT / "models" / "xgb_feeder_models.pkl"  # EMS 讀取統一走 data.ems_loads._read_ems (glob 定位)
FEEDER_COLS = [f"VCB{i}" for i in range(1, 12)]   # VCB12=0 不預測

# joblib.load 結果記憶體快取:forecast 每次呼叫都要載模型,重複從磁碟反序列化是
# 「能源管理」首屏延遲與換日期卡頓的主因。以 (路徑, mtime) 為鍵,重訓覆寫時自動失效。
_MODEL_CACHE: dict[tuple[str, int], object] = {}


def _load_model_cached(path: Path):
    import joblib
    key = (str(path), path.stat().st_mtime_ns)
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = joblib.load(path)
    return _MODEL_CACHE[key]


def _load_ems():
    sys.path.insert(0, str(ROOT))
    from data.ems_loads import _read_ems   # 重用穩健讀取器
    return _read_ems()


def _attach_temp(t):
    """為 EMS 逐時表依「日期」併入永康站日均溫欄 temp_mean。缺資料以全期均溫補。"""
    from data.weather import daily_temps
    wx = daily_temps()[["date", "temp_mean"]].copy()
    t = t.copy()
    t["date"] = t["dt"].dt.normalize()
    wx["date"] = wx["date"].dt.normalize()
    t = t.merge(wx, on="date", how="left")
    t["temp_mean"] = t["temp_mean"].fillna(wx["temp_mean"].mean())
    return t


def _features(dt, temp=None):
    """dt: pandas datetime Series → 特徵 DataFrame。

    temp: 對齊 dt 的日均溫 Series/陣列;None 時不含氣溫特徵 (純時間,舊行為)。
    加入 temp 後同星期幾不同日 (氣溫不同) 才能得到不同預測 → 逐週不再相同。
    """
    dt = pd.Series(dt).reset_index(drop=True)
    h = dt.dt.hour
    dow = dt.dt.dayofweek
    feats = pd.DataFrame({
        "hour_sin": np.sin(2 * np.pi * h / 24),
        "hour_cos": np.cos(2 * np.pi * h / 24),
        "dow_sin": np.sin(2 * np.pi * dow / 7),
        "dow_cos": np.cos(2 * np.pi * dow / 7),
        "is_weekend": (dow >= 5).astype(int),
        "hour": h.astype(int),
        "dow": dow.astype(int),
    })
    if temp is not None:
        feats["temp"] = np.asarray(temp, dtype=float)
    return feats


def train_and_evaluate(save=True):
    """5月訓練、6月測試;印各饋線 MAE/MAPE/R²,存模型。回傳 {feeder: model}。"""
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, r2_score

    # 註: 實測氣溫對本校園總量幾無預測力 (corr≈±0.1 且月間變號),
    # 加入反而升高測試誤差 (見 analysis/compare_temp_feature.py),故production維持純時間。
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


# ── 行事曆感知模型 (需量逐時預測專用) ──────────────────────────────
# 與共用 MODEL_FILE(純時間,5月訓練)分離,避免影響 experiment1 / EUI / 帳單。
MODEL_FILE_CAL = ROOT / "models" / "xgb_feeder_models_cal.pkl"


def _features_cal(dt):
    """需量預測特徵 = 時間 + 學期行事曆 (校園是否有人/考試/暑假)。"""
    from data.academic_calendar import calendar_features
    return pd.concat([_features(dt), calendar_features(dt)], axis=1)


def train_calendar_model(save=True):
    """全期(5+6月)資料訓練含行事曆特徵的饋線模型;5-fold CV 評估;存 MODEL_FILE_CAL。

    為何全期而非 5月訓練/6月測試: 端午連假/補班等「讓週與週不同」的事件只出現在
    6月,僅用 5月訓練學不到 → 改全期訓練 + CV 估計 (見 compare_temp_feature.py)。

    ⚠ 此處 CV 數字**不可作為泛化性能引用**: KFold(shuffle=True) 對逐時序列會洩漏
    —— 特徵純為時間戳的函數,同一 (小時×星期×行事曆旗標) 組合在不同週幾乎同值,
    洗牌後一份落訓練、一份落驗證,等同以近重複樣本自測,故偏樂觀。此模型僅為 lag
    缺值時的退回路徑。需引用泛化誤差請用 train_lag_model() 的 3-5月→6月 嚴格留出。
    """
    import joblib
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, r2_score
    from sklearn.model_selection import KFold

    t = _load_ems().reset_index(drop=True)
    X = _features_cal(t["dt"])
    ytot = t[FEEDER_COLS].sum(axis=1).values
    params = dict(n_estimators=300, max_depth=4, learning_rate=0.05,
                  subsample=0.9, colsample_bytree=0.9, random_state=0)

    oof = np.zeros(len(t))                       # 5-fold CV 袋外總量預測
    for tr, te in KFold(5, shuffle=True, random_state=0).split(X):
        for c in FEEDER_COLS:
            m = xgb.XGBRegressor(**params).fit(X.iloc[tr], t[c].values[tr])
            oof[te] += np.clip(m.predict(X.iloc[te]), 0, None)
    mae = mean_absolute_error(ytot, oof)
    mape = np.mean(np.abs((ytot - oof) / np.clip(np.abs(ytot), 1e-6, None))) * 100
    print(f"行事曆模型 5-fold CV 總量: MAE {mae:.0f} kW  MAPE {mape:.1f}%  "
          f"R² {r2_score(ytot, oof):.2f}")
    print("⚠ 上列 CV 因洗牌折而偏樂觀 (見 docstring),勿作泛化性能引用;"
          "請改引 train_lag_model() 的 3-5月→6月 留出驗證。")

    models = {c: xgb.XGBRegressor(**params).fit(X, t[c].values) for c in FEEDER_COLS}
    if save:
        MODEL_FILE_CAL.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(models, MODEL_FILE_CAL)
        print(f"✓ 行事曆模型已存: {MODEL_FILE_CAL}")
    return models


def predict_feeder_kw_cal(timestamp):
    """行事曆感知預測 (需量逐時專用) → {VCBx: kw}。無模型則自動先訓練。"""
    import joblib
    if not MODEL_FILE_CAL.exists():
        train_calendar_model(save=True)
    models = joblib.load(MODEL_FILE_CAL)
    X = _features_cal(pd.Series([pd.Timestamp(timestamp)]))
    out = {c: float(max(0.0, models[c].predict(X)[0])) for c in FEEDER_COLS}
    out["VCB12"] = 0.0
    return out


# ── 近期實際負載 (lag/自迴歸) 模型 (需量逐時預測專用) ──────────────
# 讓模型看「昨日同時 (lag24)、上週同時 (lag168)」的實測 → 逐日/逐週真的不同。
# 各饋線各自的 lag (預測 VCBx 用 VCBx 的歷史)。預測需近期實測 (短期預測);
# 歷史 demo 因 EMS 有完整實測故可行。資料起首一週無 lag168 → 自動退回行事曆模型。
MODEL_FILE_LAG = ROOT / "models" / "xgb_feeder_models_lag.pkl"
_LAGS = (24, 168)                                # 昨日同時、上週同時 (小時)


def _ems_sorted():
    """所有可用「各饋線」月份 (3-4、5-6…) 合併排序,供 lag 模型訓練/查值。"""
    sys.path.insert(0, str(ROOT))
    from data.ems_loads import read_feeder_ems_all
    return read_feeder_ems_all().sort_values("dt").reset_index(drop=True)


def _feeder_series(t):
    """{VCBx: 以 dt 為索引的實測 Series} —— 供 lag 對齊查值。"""
    idx = pd.DatetimeIndex(t["dt"])
    return {c: pd.Series(t[c].values, index=idx) for c in FEEDER_COLS}


def _lag_frame(series_c, when):
    """某饋線在時間索引 when 上的各 lag 實測值 → DataFrame[lag24, lag168]。"""
    when = pd.DatetimeIndex(when)
    return pd.DataFrame({
        f"lag{L}": series_c.reindex(when - pd.Timedelta(hours=L)).values for L in _LAGS
    })


def train_lag_model(save=True):
    """時間&行事曆&近期實測(lag) 特徵,各饋線一模型。

    嚴格 holdout:**6 月之前 (3-5月) 訓練、只驗 6 月**,印 6 月驗證 MAE/MAPE/R²,存模型。
    3-4 月含清明/兒童節連假,模型訓練時即見過「放假→低載」→ 6 月端午等假日預測改善。
    lag 特徵在 6 月預測取「當週/前一日實測」為輸入,故逐週仍不同。
    """
    import joblib
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, r2_score

    t = _ems_sorted()
    base = _features_cal(t["dt"])                # 時間 + 行事曆 (n 列)
    ser = _feeder_series(t)
    lagf = {c: _lag_frame(ser[c], t["dt"]) for c in FEEDER_COLS}

    valid = np.ones(len(t), bool)                # 全饋線 lag 皆有值的列 (去起首無 lag168)
    for c in FEEDER_COLS:
        valid &= lagf[c].notna().all(axis=1).values
    month = t["dt"].dt.month.values
    tr_idx = np.where(valid & (month < 6))[0]    # 訓練 = 6 月之前 (3-5月)
    te_idx = np.where(valid & (month == 6))[0]   # 驗證 = 6 月

    params = dict(n_estimators=400, max_depth=5, learning_rate=0.05,
                  subsample=0.9, colsample_bytree=0.9, random_state=0)

    def _X(c, idx):
        return pd.concat([base.iloc[idx].reset_index(drop=True),
                          lagf[c].iloc[idx].reset_index(drop=True)], axis=1)

    models, ptot = {}, np.zeros(len(te_idx))     # 6 月各饋線預測加總
    for c in FEEDER_COLS:
        m = xgb.XGBRegressor(**params).fit(_X(c, tr_idx), t[c].values[tr_idx])
        models[c] = m
        ptot += np.clip(m.predict(_X(c, te_idx)), 0, None)

    ytot = t[FEEDER_COLS].sum(axis=1).values[te_idx]
    mae = mean_absolute_error(ytot, ptot)
    mape = np.mean(np.abs((ytot - ptot) / np.clip(np.abs(ytot), 1e-6, None))) * 100
    print(f"lag 模型 3-5月訓練→6月驗證 總量: MAE {mae:.0f} kW  MAPE {mape:.1f}%  "
          f"R² {r2_score(ytot, ptot):.2f}  (訓練 {len(tr_idx)} / 驗證 {len(te_idx)} 列)")

    if save:
        MODEL_FILE_LAG.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(models, MODEL_FILE_LAG)
        print(f"✓ lag 模型(3-5月訓練)已存: {MODEL_FILE_LAG}")
    return models


def predict_day_feeders(date, lag=True):
    """該日 0-23 時各饋線 kW → list[24]{VCBx: kw}。

    lag=True: 用近期實測 (lag) 模型,逐日不同;無 lag 的時段自動退回行事曆模型。
    lag=False: 純時間 + 行事曆模型 (同星期幾相同)。
    """
    ts = pd.Series([pd.Timestamp(f"{date} {h:02d}:00") for h in range(24)])
    base = _features_cal(ts)

    def _cal_day():
        if not MODEL_FILE_CAL.exists():
            train_calendar_model(save=True)
        m = _load_model_cached(MODEL_FILE_CAL)
        pr = {c: np.clip(m[c].predict(base), 0, None) for c in FEEDER_COLS}
        return [{c: float(pr[c][h]) for c in FEEDER_COLS} for h in range(24)]

    if not lag:
        return _cal_day()

    if not MODEL_FILE_LAG.exists():
        train_lag_model(save=True)
    models = _load_model_cached(MODEL_FILE_LAG)
    ser = _feeder_series(_ems_sorted())

    valid = np.ones(24, bool)
    kw = {}
    for c in FEEDER_COLS:
        lf = _lag_frame(ser[c], ts)
        valid &= lf.notna().all(axis=1).values
        Xc = pd.concat([base.reset_index(drop=True), lf], axis=1).fillna(0.0)
        kw[c] = np.clip(models[c].predict(Xc), 0, None)

    if not valid.all():                          # 缺 lag 的時段退回行事曆模型
        cal = _cal_day()
        for h in range(24):
            if not valid[h]:
                for c in FEEDER_COLS:
                    kw[c][h] = cal[h][c]
    return [{c: float(kw[c][h]) for c in FEEDER_COLS} for h in range(24)]


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
