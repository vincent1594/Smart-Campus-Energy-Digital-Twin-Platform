from fastapi import APIRouter, Depends, HTTPException, Query

from webapi.deps import use_network
from webapi.schemas import (
    DerAsset,
    FeederDetail,
    ReplacementEconomicsReport,
    TransformerDetail,
    TransformerRisk,
    TransformerSpec,
    VcbDetail,
)
from webapi.services import asset_service, replacement_service

router = APIRouter(prefix="/api/{network_id}/assets", tags=["assets"],
                   dependencies=[Depends(use_network)])


# ---------- Transformer ----------
@router.get("/transformers", response_model=list[TransformerDetail])
def list_transformers():
    return asset_service.list_transformers()


# 變壓器規格明細(原始銘牌/實測資料,供營繕組核對;不對應潮流模型)
@router.get("/transformer-specs", response_model=list[TransformerSpec])
def list_transformer_specs():
    return asset_service.list_transformer_specs()


# 汰換優先序:依屆齡/負載/溫度/效率算風險分數,降冪排序(營繕組資本門規劃)
@router.get("/replacement-priority", response_model=list[TransformerRisk])
def replacement_priority():
    return replacement_service.replacement_priority()


# 汰換投資回收:換新成本 vs 換高效機年省電費 → 回收年限(營繕組資本門效益)
@router.get("/replacement-economics", response_model=ReplacementEconomicsReport)
def replacement_economics(
    unit_price: float = Query(600.0, gt=0, description="換新單價 NT$/kVA"),
    energy_price: float = Query(3.0, gt=0, description="電價 NT$/kWh"),
):
    return replacement_service.replacement_economics(unit_price, energy_price)


@router.get("/transformers/{transformer_id}", response_model=TransformerDetail)
def get_transformer(transformer_id: str):
    detail = asset_service.get_transformer(transformer_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"查無變壓器:{transformer_id}")
    return detail


# ---------- 微電網 (太陽能 / 儲能 / 發電機) ----------
@router.get("/der", response_model=list[DerAsset])
def list_der():
    return asset_service.list_der()


# ---------- VCB ----------
@router.get("/vcbs", response_model=list[VcbDetail])
def list_vcbs():
    return asset_service.list_vcbs()


# ---------- Feeder ----------
@router.get("/feeders", response_model=list[FeederDetail])
def list_feeders():
    return asset_service.list_feeders()


@router.get("/feeders/{feeder_id}", response_model=FeederDetail)
def get_feeder(feeder_id: str):
    detail = asset_service.get_feeder(feeder_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"查無饋線:{feeder_id}")
    return detail
