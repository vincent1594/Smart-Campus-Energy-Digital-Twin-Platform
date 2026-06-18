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

from webapi.schemas import RiskFactor, TransformerRisk
from webapi.services.asset_service import list_transformer_specs

LIFE_YEARS = 25.0          # 變壓器設計壽命參考 (正規化用)
W_AGE, W_LOAD, W_TEMP, W_EFF = 0.40, 0.25, 0.20, 0.15


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
