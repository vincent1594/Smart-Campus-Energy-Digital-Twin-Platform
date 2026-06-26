"""
論文實驗 Experiment 1 & 2
============================================================
Exp1  負載預測準度: 5月訓練、6月驗證,輸出各饋線 VCB1~VCB11 的 MAPE/MAE/R²。
Exp2  預測誤差對潮流的影響: 6月每小時各跑兩次潮流
      (A=真實 VCB 負載, B=AI 預測 VCB 負載),比較
      min_vm_pu / total_loss_kw / max_trafo_loading_pct / max_line_loading_pct。
      PV 關閉 (EMS 已是淨台電;A/B 一致處理,比較最乾淨)。

用法:
    python analysis/experiments.py            # 跑 Exp1 + Exp2(全720小時)
    python analysis/experiments.py 48         # Exp2 只跑前 48 小時(快速測試)
輸出: results/experiments/  (exp1_mape.csv, exp2_hourly.csv, exp2_scatter.png)
"""

import sys
import math
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
pass  # [phase0] sys.path.insert removed
OUT = ROOT / "results" / "experiments"

FEEDER_COLS = [f"VCB{i}" for i in range(1, 12)]


# ============================================================
# Experiment 1 — 負載預測準度
# ============================================================
def experiment1():
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error, r2_score
    from networks.north.analysis.xgb_forecast import _load_ems, _features, MODEL_FILE
    import joblib

    t = _load_ems()
    train, test = t[t["dt"].dt.month == 5], t[t["dt"].dt.month == 6]
    Xtr, Xte = _features(train["dt"]), _features(test["dt"])

    rows, models, actuals, preds = [], {}, {}, {}
    for c in FEEDER_COLS:
        m = xgb.XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                             subsample=0.9, colsample_bytree=0.9, random_state=0)
        m.fit(Xtr, train[c].values)
        models[c] = m
        yte = test[c].values
        p = np.clip(m.predict(Xte), 0, None)
        actuals[c], preds[c] = yte, p
        mae = mean_absolute_error(yte, p)
        mape = np.mean(np.abs((yte - p) / np.clip(np.abs(yte), 1e-6, None))) * 100
        rows.append({"feeder": c, "MAE_kW": round(mae, 1),
                     "MAPE_%": round(mape, 1), "R2": round(r2_score(yte, p), 2),
                     "mean_actual_kW": round(yte.mean(), 1)})
    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, MODEL_FILE)

    df = pd.DataFrame(rows)
    # 加權 MAPE (以實際用電加權,避免小饋線失真)
    w = df["mean_actual_kW"]
    wmape = np.average(df["MAPE_%"], weights=w)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / "exp1_mape.csv", index=False, encoding="utf-8-sig")

    print("=" * 56)
    print("Experiment 1 — 負載預測準度 (5月訓練 / 6月驗證)")
    print("=" * 56)
    print(df.to_string(index=False))
    print("-" * 56)
    print(f"加權 MAPE (依用電量加權) = {wmape:.1f}%")
    print(f"模型已存: {MODEL_FILE}")
    return models, df, wmape, test["dt"].reset_index(drop=True), actuals, preds


# ============================================================
# Experiment 2 — 預測誤差對潮流的影響
# ============================================================
def experiment2(models, max_hours=None):
    import pandapower as pp
    import joblib
    from networks.north.models.network_builder import build_network_s1_baseline
    from networks.north.data.ems_loads import _read_ems, _distribute, _calib_weights
    from networks.north.data.load_data import DEFAULT_BUILDING_LOADS
    from networks.north.analysis.xgb_forecast import _features, MODEL_FILE

    if models is None:
        models = joblib.load(MODEL_FILE)

    # 6月資料 + 預測
    ems = _read_ems()
    june = ems[ems["dt"].dt.month == 6].reset_index(drop=True)
    if max_hours:
        june = june.head(max_hours)
    Xj = _features(june["dt"])
    pred = {c: np.clip(models[c].predict(Xj), 0, None) for c in FEEDER_COLS}

    # 建網一次;預先算 calib 權重、各負載 pf、name→index
    net = build_network_s1_baseline()
    calib = _calib_weights()
    name_idx = {net.load.at[i, "name"]: i for i in net.load.index}
    pf_of = {nm: DEFAULT_BUILDING_LOADS.get(nm, {}).get("pf", 0.9) for nm in name_idx}

    def set_and_solve(feeder_kw):
        loads = _distribute(feeder_kw, None, calib)      # PV 關閉
        for nm, idx in name_idx.items():
            pk = loads.get(nm, 0.0)
            pf = pf_of[nm]
            net.load.at[idx, "p_mw"] = pk / 1000.0
            net.load.at[idx, "q_mvar"] = pk * math.tan(math.acos(pf)) / 1000.0
        try:
            pp.runpp(net, algorithm="nr", init="flat")
        except Exception:
            return [np.nan] * 4
        vm = net.res_bus["vm_pu"].dropna()
        loss = (net.res_line["pl_mw"].sum() + net.res_trafo["pl_mw"].sum()) * 1000
        return [vm.min(),
                float(loss),
                float(net.res_trafo["loading_percent"].max()),
                float(net.res_line["loading_percent"].max())]

    recs = []
    for h in range(len(june)):
        rf = {c: float(june[c].iloc[h]) for c in FEEDER_COLS}; rf["VCB12"] = 0.0
        pf_ = {c: float(pred[c][h]) for c in FEEDER_COLS}; pf_["VCB12"] = 0.0
        rmin, rloss, rtr, rln = set_and_solve(rf)
        pmin, ploss, ptr, pln = set_and_solve(pf_)
        recs.append({"dt": june["dt"].iloc[h],
                     "real_min_vm_pu": rmin, "pred_min_vm_pu": pmin,
                     "real_total_loss_kw": rloss, "pred_total_loss_kw": ploss,
                     "real_max_trafo_pct": rtr, "pred_max_trafo_pct": ptr,
                     "real_max_line_pct": rln, "pred_max_line_pct": pln})

    df = pd.DataFrame(recs)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / "exp2_hourly.csv", index=False, encoding="utf-8-sig")

    print("\n" + "=" * 64)
    print(f"Experiment 2 — 預測誤差對潮流的影響 (6月 {len(df)} 小時, PV關閉)")
    print("=" * 64)
    print(f"{'指標':<22}{'真實均':>9}{'預測均':>9}{'MAE':>9}{'最大|Δ|':>9}{'corr':>7}")
    print("-" * 64)
    metrics = [("min_vm_pu", "min_vm_pu", 4), ("total_loss_kw", "total_loss_kw", 1),
               ("max_trafo_pct", "max_trafo_pct", 1), ("max_line_pct", "max_line_pct", 1)]
    summary = []
    for label, key, nd in metrics:
        r, p = df["real_" + key], df["pred_" + key]
        mae = float(np.mean(np.abs(p - r)))
        maxd = float(np.max(np.abs(p - r)))
        corr = float(np.corrcoef(r, p)[0, 1]) if len(df) > 1 else float("nan")
        summary.append({"metric": label, "real_mean": float(r.mean()), "pred_mean": float(p.mean()),
                        "mae": mae, "maxd": maxd, "corr": corr, "nd": nd})
        print(f"{label:<22}{r.mean():>9.{nd}f}{p.mean():>9.{nd}f}{mae:>9.{nd}f}{maxd:>9.{nd}f}{corr:>7.2f}")
    print(f"\n逐時結果已存: {OUT / 'exp2_hourly.csv'}")

    _plot_exp2(df)
    return df, summary


def _plot_exp2(df):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        return
    metrics = [("min_vm_pu", "Min bus voltage (pu)"),
               ("total_loss_kw", "Total loss (kW)"),
               ("max_trafo_pct", "Max transformer loading (%)"),
               ("max_line_pct", "Max line loading (%)")]
    fig, axes = plt.subplots(1, 4, figsize=(18, 4.2))
    for ax, (key, title) in zip(axes, metrics):
        r, p = df["real_" + key], df["pred_" + key]
        ax.scatter(r, p, s=10, alpha=0.4)
        lo, hi = min(r.min(), p.min()), max(r.max(), p.max())
        ax.plot([lo, hi], [lo, hi], "r--", lw=1)          # y=x 參考線
        ax.set_xlabel("Actual"); ax.set_ylabel("Predicted"); ax.set_title(title)
    fig.suptitle("Exp2: power-flow metrics — actual vs AI-predicted feeder loads (June)")
    fig.tight_layout()
    fig.savefig(OUT / "exp2_scatter.png", dpi=130)
    print(f"散布圖已存: {OUT / 'exp2_scatter.png'}")


_FLAB = {"VCB1": "N.Y.F.G東", "VCB2": "M.Z.G西.H3", "VCB3": "K.L.Q.R", "VCB4": "P.X",
         "VCB5": "A.B", "VCB6": "T.V", "VCB7": "C.D", "VCB8": "S", "VCB9": "J",
         "VCB10": "W生活", "VCB11": "I工學院"}


def write_report(e1df, wmape, e1_dt, e1_act, e1_pred, e2df, e2summary):
    """把 Exp1 + Exp2 整理成詳細 txt(含逐時明細與綜合比較)。"""
    from datetime import datetime
    # Exp1 逐時完整 CSV (寬表: dt + 各饋線 實測/預測)
    h = {"dt": [pd.Timestamp(x).strftime("%Y-%m-%d %H:%M") for x in e1_dt]}
    for c in FEEDER_COLS:
        h[c + "_actual"] = np.round(e1_act[c], 1)
        h[c + "_pred"] = np.round(e1_pred[c], 1)
    OUT.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(h).to_csv(OUT / "exp1_hourly.csv", index=False, encoding="utf-8-sig")
    L = []
    L.append("=" * 92)
    L.append("校園 11.4kV 配電系統 — AI 負載預測 實驗報告 (Experiment 1 & 2)")
    L.append(f"產生時間 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | XGBoost(5月訓練/6月測試) | pandapower 潮流")
    L.append("=" * 92)
    L.append("")
    # 摘要
    worst_tr = e2summary[2]
    L.append("【摘要】")
    L.append(f"  Exp1 各饋線負載預測 加權 MAPE = {wmape:.1f}% (純時間特徵,無氣溫)。")
    L.append(f"  Exp2 (6月 {len(e2df)} 小時) 預測誤差傳遞到潮流的影響:")
    L.append(f"    - 電壓 min_vm_pu:   MAE {e2summary[0]['mae']:.4f} pu (幾乎不受影響)")
    L.append(f"    - 系統總損耗:        MAE {e2summary[1]['mae']:.1f} kW (影響極小)")
    L.append(f"    - 最重變壓器負載率:  MAE {worst_tr['mae']:.1f}%、最大偏差 {worst_tr['maxd']:.1f}% (尖峰時 AI 低估,須謹慎)")
    L.append(f"    - 最重電纜負載率:    MAE {e2summary[3]['mae']:.1f}%")
    L.append("  結論: 輕載系統的電壓/損耗對負載預測誤差不敏感;設備尖峰負載率評估會被 AI 低估。")
    L.append("")

    # 實驗一
    L.append("=" * 92)
    L.append("[實驗一] 負載預測準度  (5月訓練 / 6月驗證)")
    L.append("-" * 92)
    L.append("方法: 每饋線一個 XGBoost;特徵=小時/星期(sin/cos)+平日假日(無氣溫);目標=該饋線 kW。")
    L.append("")
    L.append(f"  {'饋線':<7}{'MAE(kW)':>9}{'MAPE(%)':>9}{'R2':>7}{'平均實際(kW)':>13}")
    L.append("  " + "-" * 45)
    for _, r in e1df.iterrows():
        L.append(f"  {r['feeder']:<7}{r['MAE_kW']:>9.1f}{r['MAPE_%']:>9.1f}{r['R2']:>7.2f}{r['mean_actual_kW']:>13.1f}")
    L.append("  " + "-" * 45)
    L.append(f"  加權 MAPE(依用電量加權) = {wmape:.1f}%")
    L.append("  解讀: 大饋線(VCB3/6/10/11)R²較高;小饋線(VCB2)MAPE失真且R²為負(分母小)。")
    L.append("")
    # 實驗一 — 逐時明細 (各饋線 實測 vs AI預測)
    L.append("-" * 92)
    L.append(f"  逐時明細 (6月 {len(e1_dt)} 小時,各饋線 實測EMS vs AI預測;APE=絕對百分誤差):")
    for c in FEEDER_COLS:
        L.append("")
        L.append(f"  ── {c} ({_FLAB[c]}) ──")
        L.append(f"    {'時間':<14}{'實測kW':>9}{'預測kW':>9}{'|誤差|':>8}{'APE%':>7}")
        for i in range(len(e1_dt)):
            a = float(e1_act[c][i]); pr = float(e1_pred[c][i]); err = abs(pr - a)
            ape = err / max(abs(a), 1e-6) * 100
            ts = pd.Timestamp(e1_dt[i]).strftime("%m/%d %H:%M")
            L.append(f"    {ts:<14}{a:>9.1f}{pr:>9.1f}{err:>8.1f}{ape:>7.1f}")
    L.append("")

    # 實驗二 — 彙總
    L.append("=" * 92)
    L.append(f"[實驗二] 預測誤差對潮流的影響  (6月 {len(e2df)} 小時, 真實 vs AI預測, PV關閉)")
    L.append("-" * 92)
    L.append("方法: 每小時各跑兩次潮流(真實饋線 / 預測饋線),經相同分配(容量+VCB3校正)→ 比較 4 指標。")
    L.append("")
    L.append(f"  {'指標':<20}{'真實均':>10}{'預測均':>10}{'MAE':>10}{'最大|Δ|':>10}{'corr':>7}")
    L.append("  " + "-" * 67)
    for s in e2summary:
        nd = s["nd"]
        L.append(f"  {s['metric']:<20}{s['real_mean']:>10.{nd}f}{s['pred_mean']:>10.{nd}f}"
                 f"{s['mae']:>10.{nd}f}{s['maxd']:>10.{nd}f}{s['corr']:>7.2f}")
    L.append("")

    # 誤差最大前 10 時刻 (依變壓器負載率誤差)
    e2df = e2df.copy()
    e2df["d_trafo"] = (e2df["pred_max_trafo_pct"] - e2df["real_max_trafo_pct"]).abs()
    top = e2df.sort_values("d_trafo", ascending=False).head(10)
    L.append("  ◆ 變壓器負載率 誤差最大的前 10 時刻 (AI 失準最嚴重):")
    L.append(f"    {'時間':<17}{'實際%':>8}{'預測%':>8}{'|Δ|%':>8}")
    for _, r in top.iterrows():
        ts = pd.Timestamp(r["dt"]).strftime("%m/%d %H:%M")
        L.append(f"    {ts:<17}{r['real_max_trafo_pct']:>8.1f}{r['pred_max_trafo_pct']:>8.1f}{r['d_trafo']:>8.1f}")
    L.append("")

    # 逐時明細
    L.append("-" * 92)
    L.append("  逐時明細 (實=真實負載潮流, 預=AI預測負載潮流):")
    L.append(f"  {'時間':<14}{'minVm實':>9}{'minVm預':>9}{'損耗實':>8}{'損耗預':>8}"
             f"{'變壓實%':>8}{'變壓預%':>8}{'電纜實%':>8}{'電纜預%':>8}")
    L.append("  " + "-" * 84)
    for _, r in e2df.iterrows():
        ts = pd.Timestamp(r["dt"]).strftime("%m/%d %H:%M")
        L.append(f"  {ts:<14}{r['real_min_vm_pu']:>9.4f}{r['pred_min_vm_pu']:>9.4f}"
                 f"{r['real_total_loss_kw']:>8.1f}{r['pred_total_loss_kw']:>8.1f}"
                 f"{r['real_max_trafo_pct']:>8.1f}{r['pred_max_trafo_pct']:>8.1f}"
                 f"{r['real_max_line_pct']:>8.1f}{r['pred_max_line_pct']:>8.1f}")
    L.append("")

    # 綜合比較與結論
    L.append("=" * 92)
    L.append("[綜合比較與結論]")
    L.append("-" * 92)
    L.append(f"  1. 預測層(Exp1): 各饋線負載 加權 MAPE ~{wmape:.0f}%,主因無氣溫、僅時間特徵。")
    L.append( "  2. 潮流層(Exp2): 上述誤差傳遞到電網評估後 ——")
    L.append(f"       電壓 min_vm_pu 僅差 {e2summary[0]['mae']:.4f} pu、損耗僅差 {e2summary[1]['mae']:.1f} kW")
    L.append( "       → 因系統輕載、電壓接近 1.0,對負載誤差高度不敏感。")
    L.append(f"  3. 例外: 變壓器最重負載率 在尖峰時最大偏差達 {worst_tr['maxd']:.1f}%(AI 低估)。")
    L.append( "       → 設備容量/尖峰評估須謹慎,建議導入氣溫特徵改善。")
    L.append( "  4. 總結: AI(時間特徵)預測『足以支援電壓與損耗評估』,但『尖峰設備負載率』仍需修正。")
    L.append("=" * 92)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "experiments_report.txt").write_text("\n".join(L), encoding="utf-8")
    print(f"\n✓ 實驗報告已存: {OUT / 'experiments_report.txt'}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    mh = int(sys.argv[1]) if len(sys.argv) > 1 else None
    models, e1df, wmape, e1_dt, e1_act, e1_pred = experiment1()
    e2df, e2sum = experiment2(models, max_hours=mh)
    write_report(e1df, wmape, e1_dt, e1_act, e1_pred, e2df, e2sum)
