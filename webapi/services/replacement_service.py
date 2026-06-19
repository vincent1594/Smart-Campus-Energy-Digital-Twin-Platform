"""變壓器汰換風險排序 (營繕組資本門設備汰換規劃)。

從既有銘牌/實測資料 (transformer_specs.json,52 台) 算「汰換優先風險分數」,
四個透明、可稽核的因子加權:

    屆齡 (年份)    權重 0.40  —— 變壓器設計壽命 ~25 年,愈老絕緣老化風險愈高
    負載率         權重 0.25  —— 長期高載加速老化、過載風險
    實測溫度       權重 0.20  —— 溫升驅動絕緣劣化 (每 +8~10°C 壽命減半)
    效率           權重 0.15  —— 偏低反映鐵芯老化/損耗

每因子正規化到 0-100,缺值者該因子略過、權重於可用因子間重新正規化。
綜合分數 ≥60 高(建議優先汰換)、40-59 中(列入觀察)、<40 低。
分數為「相對排序」依據,非絕對壽命預測;最終仍需現場檢測佐證。
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from webapi.schemas import (
    ReplacementEconomics,
    ReplacementEconomicsReport,
    RiskFactor,
    TransformerRisk,
)
from webapi.services.asset_service import list_transformer_specs

LIFE_YEARS = 25.0          # 變壓器設計壽命參考 (正規化用)
W_AGE, W_LOAD, W_TEMP, W_EFF = 0.40, 0.25, 0.20, 0.15

# ---- 投資回收:標準變壓器損耗模型 (佔容量比例) ----
# 不用 spec.efficiency(其值域 0.62–0.92 對變壓器不合理),改用銘牌級損耗典型值:
#   損耗 = 無載損(鐵損,恆定) + 負載損(銅損,隨負載率平方)。
P0_OLD, PK_OLD = 0.0025, 0.014   # 舊機:無載 0.25%、滿載銅損 1.4% of kVA
P0_NEW, PK_NEW = 0.0008, 0.010   # 新高效機(低損/非晶):無載 0.08%、滿載銅損 1.0%
DEFAULT_LOAD_RATIO = 30.0        # 缺負載率時的保守預設 (%)
HOURS_PER_YEAR = 8760.0
UNIT_PRICE_NT_PER_KVA = 600.0    # 換新單價假設 (油式基準)
DRY_TYPE_FACTOR = 1.4            # 乾式/環氧樹脂較貴
ENERGY_PRICE_NT_PER_KWH = 3.0    # 損耗電價假設 (全年 24h)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _parse_year(year: str) -> Optional[int]:
    try:
        y = int(str(year).strip()[:4])
        return y if 1900 < y < 2100 else None
    except (ValueError, TypeError):
        return None


def _compute_one(spec, now_year: int) -> TransformerRisk:
    factors: list[RiskFactor] = []

    age = None
    y = _parse_year(spec.year)
    if y is not None:
        age = now_year - y
        factors.append(RiskFactor(
            name="屆齡", detail=f"屆齡 {age} 年（{y}）",
            score=round(_clamp01(age / LIFE_YEARS) * 100, 0), weight=W_AGE,
        ))

    if spec.load_ratio_percent is not None:
        factors.append(RiskFactor(
            name="負載", detail=f"負載率 {spec.load_ratio_percent:.0f}%",
            score=round(_clamp01(spec.load_ratio_percent / 100.0) * 100, 0), weight=W_LOAD,
        ))

    if spec.temperature_c is not None:
        factors.append(RiskFactor(
            name="溫度", detail=f"實測溫度 {spec.temperature_c:.0f}°C",
            score=round(_clamp01((spec.temperature_c - 35.0) / (75.0 - 35.0)) * 100, 0), weight=W_TEMP,
        ))

    if spec.efficiency is not None:
        factors.append(RiskFactor(
            name="效率", detail=f"效率 {spec.efficiency}",
            score=round(_clamp01((0.92 - spec.efficiency) / (0.92 - 0.62)) * 100, 0), weight=W_EFF,
        ))

    # 綜合:可用因子間重新正規化權重
    wsum = sum(f.weight for f in factors)
    score = round(sum(f.score * f.weight for f in factors) / wsum, 1) if wsum > 0 else 0.0
    level = "高" if score >= 60 else "中" if score >= 40 else "低"

    # 主要風險因子 (依貢獻 = score×weight 取前 2) + 建議行動
    top = sorted(factors, key=lambda f: f.score * f.weight, reverse=True)
    top = [f for f in top if f.score * f.weight >= 8][:2] or top[:1]
    action = {"高": "建議優先汰換", "中": "列入觀察追蹤", "低": "狀況尚可"}[level]
    reason = "、".join(f.detail for f in top) + f" → {action}" if top else action

    return TransformerRisk(
        tag=spec.tag, building=spec.building, brand=spec.brand, year=spec.year,
        age_years=age, capacity_kva=spec.capacity_kva, trafo_type=spec.trafo_type,
        load_ratio_percent=spec.load_ratio_percent, temperature_c=spec.temperature_c,
        efficiency=spec.efficiency,
        risk_score=score, risk_level=level, factors=factors, reason=reason,
    )


def replacement_priority() -> list[TransformerRisk]:
    now_year = datetime.now().year
    risks = [_compute_one(s, now_year) for s in list_transformer_specs()]
    risks.sort(key=lambda r: r.risk_score, reverse=True)
    return risks


def _is_dry(trafo_type: str) -> bool:
    return any(k in (trafo_type or "") for k in ("乾", "環氧", "樹脂", "Dry", "dry"))


def _economics_one(r: TransformerRisk, unit_price: float, energy_price: float) -> ReplacementEconomics:
    cap = float(r.capacity_kva or 0)
    lr = (r.load_ratio_percent if r.load_ratio_percent is not None else DEFAULT_LOAD_RATIO) / 100.0

    # 損耗 (kW) = 無載 + 負載損×負載率²;年節省度數 = (舊損 - 新損) × 8760
    loss_old = cap * (P0_OLD + PK_OLD * lr * lr)
    loss_new = cap * (P0_NEW + PK_NEW * lr * lr)
    saving_kwh = max(0.0, (loss_old - loss_new)) * HOURS_PER_YEAR
    saving_nt = saving_kwh * energy_price

    capex = cap * unit_price * (DRY_TYPE_FACTOR if _is_dry(r.trafo_type) else 1.0)
    payback = round(capex / saving_nt, 1) if saving_nt > 0 else None

    return ReplacementEconomics(
        tag=r.tag, building=r.building, capacity_kva=r.capacity_kva, trafo_type=r.trafo_type,
        age_years=r.age_years, load_ratio_percent=r.load_ratio_percent,
        risk_level=r.risk_level, risk_score=r.risk_score,
        capex_nt=round(capex, 0), annual_saving_kwh=round(saving_kwh, 0),
        annual_saving_nt=round(saving_nt, 0), payback_years=payback,
    )


def replacement_economics(
    unit_price: float = UNIT_PRICE_NT_PER_KVA,
    energy_price: float = ENERGY_PRICE_NT_PER_KWH,
) -> ReplacementEconomicsReport:
    risks = replacement_priority()
    items = [_economics_one(r, unit_price, energy_price) for r in risks]
    # 排序:有回收年限者依年限升冪 (最划算在前),無節省者殿後
    items.sort(key=lambda e: (e.payback_years is None, e.payback_years or 0.0))

    high = [e for e in items if e.risk_level == "高"]
    high_capex = sum(e.capex_nt for e in high)
    high_saving = sum(e.annual_saving_nt for e in high)
    blended = round(high_capex / high_saving, 1) if high_saving > 0 else None

    note = (
        f"損耗模型(銘牌典型值,非實測):舊機無載 {P0_OLD*100:.2f}%+滿載銅損 {PK_OLD*100:.1f}%、"
        f"新高效機 {P0_NEW*100:.2f}%+{PK_NEW*100:.1f}%(of kVA),銅損隨負載率²;"
        f"缺負載率以 {DEFAULT_LOAD_RATIO:.0f}% 估。乾式換新單價×{DRY_TYPE_FACTOR}。"
        "皆為規劃假設,實際以採購報價/能效標示為準。"
    )
    return ReplacementEconomicsReport(
        unit_price_nt_per_kva=round(unit_price, 0),
        energy_price_nt_per_kwh=round(energy_price, 2),
        loss_note=note, items=items,
        high_risk_count=len(high), high_risk_capex_nt=round(high_capex, 0),
        high_risk_annual_saving_nt=round(high_saving, 0),
        high_risk_blended_payback_years=blended,
    )
