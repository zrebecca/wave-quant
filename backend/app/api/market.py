from typing import List

from fastapi import APIRouter, Query

from app.api.deps import okx_guard
from app.core.config import settings
from app.schemas.market import (
    CandleOut,
    InstrumentRule,
    InstrumentStat,
    OrderBookOut,
    PublicTradesOut,
    TickerOut,
)
from app.services import market_service

router = APIRouter()


@router.get("/market/instruments", response_model=List[str])
def instruments():
    return settings.TRADING_INSTRUMENTS


@router.get("/market/instrument-rules", response_model=List[InstrumentRule])
def instrument_rules():
    try:
        return market_service.get_instrument_rules(settings.TRADING_INSTRUMENTS)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/stats", response_model=InstrumentStat)
def instrument_stat(inst_id: str = Query("BTC-USDT-SWAP")):
    try:
        return market_service.get_instrument_stat(inst_id)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/tickers", response_model=List[TickerOut])
def tickers():
    try:
        return market_service.get_tickers(settings.TRADING_INSTRUMENTS)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/ticker", response_model=TickerOut)
def ticker(inst_id: str = Query("BTC-USDT-SWAP")):
    try:
        return market_service.get_ticker(inst_id)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/all-tickers", response_model=List[TickerOut])
def all_tickers(inst_type: str = Query("SWAP")):
    try:
        return market_service.get_all_tickers(inst_type)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/orderbook", response_model=OrderBookOut)
def orderbook(inst_id: str = Query("BTC-USDT-SWAP"), depth: int = Query(20, ge=1, le=400)):
    try:
        return market_service.get_orderbook(inst_id, depth)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/trades", response_model=PublicTradesOut)
def public_trades(inst_id: str = Query("BTC-USDT-SWAP"), limit: int = Query(60, ge=1, le=500)):
    try:
        return market_service.get_public_trades(inst_id, limit)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/market/candles", response_model=CandleOut)
def candles(
    inst_id: str = Query("BTC-USDT-SWAP"),
    bar: str = Query("1H"),
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        return market_service.get_candles(inst_id, bar, limit)
    except Exception as exc:
        raise okx_guard(exc)
