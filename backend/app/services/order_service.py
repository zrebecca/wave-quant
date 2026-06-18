"""Order placement / cancellation and order/trade sync (Demo Trading only)."""
import logging
import time
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import List, Optional

import shortuuid
from sqlalchemy.orm import Session

from app.repositories import order_repo
from app.schemas.order import (
    AlgoOrderOut,
    AlgoOrderRequest,
    CancelOrderRequest,
    OrderOut,
    PlaceOrderRequest,
    TradeOut,
    TriggerOrderRequest,
)
from app.services import market_service
from app.services.log_service import log_event
from app.services.okx_client import OkxError, check, trade_api

logger = logging.getLogger(__name__)


class OrderValidationError(ValueError):
    """Local pre-trade validation failure — surfaced to the client as HTTP 400."""


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _quantize(value: float, step: Optional[float], rounding) -> Decimal:
    """Snap ``value`` to a multiple of ``step`` using high-precision Decimal.

    Critical money/size math goes through Decimal to avoid float drift (e.g. a
    0.1 + 0.2 style error sneaking into an order size)."""
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        raise OrderValidationError(f"invalid number: {value!r}")
    if step and step > 0:
        q = Decimal(str(step))
        return (d / q).to_integral_value(rounding=rounding) * q
    return d


def _reconcile(db: Session, inst_id: str, *, client_order_id: str = "", order_id: str = "") -> Optional[OrderOut]:
    """Query OKX for an order by clOrdId/ordId and upsert local state. Returns the
    reconciled order, or None when OKX has no such order."""
    resp = trade_api().get_order(instId=inst_id, ordId=order_id or "", clOrdId=client_order_id or "")
    if str(resp.get("code")) != "0":
        return None
    data = resp.get("data") or []
    if not data:
        return None
    d = data[0]
    order = order_repo.upsert_order(
        db,
        order_id=d.get("ordId"),
        client_order_id=d.get("clOrdId") or None,
        inst_id=inst_id,
        side=d.get("side"),
        ord_type=d.get("ordType"),
        price=_f(d.get("px")) or None,
        size=_f(d.get("sz")),
        filled_size=_f(d.get("accFillSz")),
        avg_price=_f(d.get("avgPx")) or None,
        state=d.get("state", "live"),
        ts=int(d["uTime"]) if d.get("uTime") else None,
    )
    return OrderOut.model_validate(order)


def reconcile_order(db: Session, inst_id: str, client_order_id: Optional[str] = None, order_id: Optional[str] = None) -> Optional[OrderOut]:
    """Public reconciliation entry point (WS reconnect, manual refresh, timeouts)."""
    return _reconcile(db, inst_id, client_order_id=client_order_id or "", order_id=order_id or "")


def place_order(db: Session, req: PlaceOrderRequest, source: str = "manual") -> OrderOut:
    # Server-side precision + limits from live instrument rules — never trust the
    # client's price/size resolution.
    rule = None
    try:
        rule = market_service.get_instrument_rule(req.inst_id)
    except Exception as exc:  # rules unavailable → fall back to raw values
        logger.warning("instrument rule unavailable for %s: %s", req.inst_id, exc)

    size_d = _quantize(req.size, rule.lot_sz if rule else None, ROUND_DOWN)
    if size_d <= 0:
        raise OrderValidationError("订单数量过小（按合约步长取整后为 0）。")
    if rule and rule.min_sz and size_d < Decimal(str(rule.min_sz)):
        raise OrderValidationError(f"最小下单量为 {rule.min_sz}，当前为 {size_d}。")
    # All price-bound types (limit / post_only / ioc / fok) carry a price; market does not.
    needs_price = req.ord_type != "market" and req.price is not None
    price_d = _quantize(req.price, rule.tick_sz if rule else None, ROUND_HALF_UP) if needs_price else None

    client_order_id = "dash" + shortuuid.uuid()[:16]
    params = dict(
        instId=req.inst_id,
        tdMode=req.td_mode,
        side=req.side,
        ordType=req.ord_type,
        sz=format(size_d.normalize(), "f"),
        clOrdId=client_order_id,
    )
    if price_d is not None:
        params["px"] = format(price_d.normalize(), "f")
    # Close orders: hedge mode carries posSide; net mode uses reduceOnly (SWAP only).
    if req.pos_side and req.pos_side != "net":
        params["posSide"] = req.pos_side
    elif req.reduce_only and req.inst_id.endswith("-SWAP"):
        params["reduceOnly"] = "true"

    # Idempotent submit: clOrdId is the dedup key. On a transport/timeout error the
    # order MAY have reached OKX, so we reconcile by clOrdId before failing — never
    # blindly re-submit.
    try:
        resp = check(trade_api().place_order(**params))
        order_id = resp["data"][0].get("ordId")
    except OkxError:
        raise  # definitive rejection from OKX (bad params, balance, etc.)
    except Exception as exc:
        logger.warning("place_order transport error; reconciling clOrdId=%s: %s", client_order_id, exc)
        recovered = _reconcile(db, req.inst_id, client_order_id=client_order_id)
        if recovered:
            log_event(
                f"Order recovered via reconciliation ({client_order_id})",
                category="order", detail={"order_id": recovered.order_id}, db=db, toast="warning",
                toast_key="toast.order.recovered", toast_vars={"id": client_order_id},
            )
            return recovered
        raise

    order = order_repo.upsert_order(
        db,
        order_id=order_id,
        client_order_id=client_order_id,
        inst_id=req.inst_id,
        side=req.side,
        ord_type=req.ord_type,
        price=float(price_d) if price_d is not None else None,
        size=float(size_d),
        filled_size=0,
        state="live",
        source=source,
        ts=int(time.time() * 1000),
    )
    log_event(
        f"Placed {req.ord_type} {req.side} {size_d} {req.inst_id}"
        + (f" @ {price_d}" if price_d is not None else ""),
        category="order",
        detail={"order_id": order_id, "source": source, "cl_ord_id": client_order_id},
        db=db,
        toast="success",
        toast_key="toast.order.placed" if price_d is not None else "toast.order.placedMkt",
        toast_vars={
            "type": req.ord_type, "side": req.side, "size": str(size_d),
            "inst": req.inst_id, "price": str(price_d) if price_d is not None else "",
        },
    )
    return OrderOut.model_validate(order)


def cancel_order(db: Session, req: CancelOrderRequest) -> dict:
    resp = check(
        trade_api().cancel_order(
            instId=req.inst_id,
            ordId=req.order_id or "",
            clOrdId=req.client_order_id or "",
        )
    )
    # Reflect the cancellation locally.
    fields = {"state": "canceled"}
    if req.order_id:
        order_repo.upsert_order(db, order_id=req.order_id, inst_id=req.inst_id, **fields)
    elif req.client_order_id:
        order_repo.upsert_order(
            db, client_order_id=req.client_order_id, inst_id=req.inst_id, **fields
        )
    log_event(
        f"Cancelled order {req.order_id or req.client_order_id} ({req.inst_id})",
        category="order",
        db=db,
        toast="info",
        toast_key="toast.order.cancelled",
        toast_vars={"id": req.order_id or req.client_order_id, "inst": req.inst_id},
    )
    return resp


def cancel_all(db: Session, inst_id: Optional[str] = None) -> int:
    """Cancel every open order (optionally for one instrument). Returns count.

    Robust against stale/phantom local records: rows with no ordId can't be real
    OKX orders, so they're cleared directly; rows whose OKX cancel fails are usually
    already gone (cancelled/filled), so we reconcile against OKX's live order list
    afterwards — otherwise the UI keeps showing orders that no longer exist.
    """
    open_orders = order_repo.list_orders(db, open_only=True, inst_id=inst_id)
    count = 0
    for order in open_orders:
        if not order.order_id:
            order.state = "canceled"  # 幻影记录（无 ordId），不可能是真实挂单，直接清理
            continue
        try:
            check(trade_api().cancel_order(instId=order.inst_id, ordId=order.order_id))
            order_repo.upsert_order(db, order_id=order.order_id, inst_id=order.inst_id, state="canceled")
            count += 1
        except Exception as exc:
            # 多半是 OKX 上已不存在（已撤/已成交）→ 交由下面的对账按 OKX 实际状态修正
            logger.warning("cancel_all: %s already gone or failed: %s", order.order_id, exc)
    db.commit()
    # 以 OKX 实际挂单为准对账：把本地仍标 live、但 OKX 上已没有的订单清掉，UI 立即同步。
    try:
        sync_open_orders(db)
    except Exception as exc:
        logger.warning("cancel_all: reconcile failed: %s", exc)
    if count:
        log_event(f"Cancelled all open orders ({count})", category="order", db=db, toast="warning",
                  toast_key="toast.order.cancelledAll", toast_vars={"count": count})
    return count


def sync_open_orders(db: Session) -> None:
    """Pull live orders from OKX and reconcile the local DB."""
    resp = check(trade_api().get_order_list())
    live_ids = set()
    for d in resp.get("data", []):
        live_ids.add(d.get("ordId"))
        order_repo.upsert_order(
            db,
            order_id=d.get("ordId"),
            client_order_id=d.get("clOrdId") or None,
            inst_id=d.get("instId"),
            side=d.get("side"),
            ord_type=d.get("ordType"),
            price=_f(d.get("px")) or None,
            size=_f(d.get("sz")),
            filled_size=_f(d.get("accFillSz")),
            avg_price=_f(d.get("avgPx")) or None,
            state=d.get("state", "live"),
            ts=int(d["uTime"]) if d.get("uTime") else None,
        )
    # Mark previously-open local orders that are no longer live on OKX as closed.
    # Mutate each row by identity (NOT upsert_order, which keys on order_id) so that
    # duplicate-ordId rows and phantom (no-ordId) rows all get reconciled — otherwise
    # the UI keeps showing orders that no longer exist on OKX.
    changed = False
    for order in order_repo.list_orders(db, open_only=True):
        if not order.order_id or order.order_id not in live_ids:
            order.state = "canceled"
            changed = True
    if changed:
        db.commit()


def list_orders(db: Session, open_only: bool = False, inst_id: Optional[str] = None) -> List[OrderOut]:
    rows = order_repo.list_orders(db, open_only=open_only, inst_id=inst_id)
    return [OrderOut.model_validate(r) for r in rows]


def sync_fills(db: Session) -> None:
    """Pull recent fills from OKX and persist any new trades."""
    resp = check(trade_api().get_fills())
    for d in resp.get("data", []):
        # Avoid dupes: insert only if trade_id unseen.
        from sqlalchemy import select

        from app.models.order import Trade

        tid = d.get("tradeId")
        if tid and db.scalar(select(Trade).where(Trade.trade_id == tid)):
            continue
        order_repo.insert_trade(
            db,
            trade_id=tid,
            order_id=d.get("ordId"),
            inst_id=d.get("instId"),
            side=d.get("side"),
            fill_px=_f(d.get("fillPx")),
            fill_sz=_f(d.get("fillSz")),
            fee=_f(d.get("fee")) or None,
            fee_ccy=d.get("feeCcy"),
            fill_pnl=_f(d.get("fillPnl")) or None,
            exec_type=d.get("execType") or None,
            ts=int(d["ts"]) if d.get("ts") else None,
        )


def list_trades(db: Session, inst_id: Optional[str] = None) -> List[TradeOut]:
    rows = order_repo.list_trades(db, inst_id=inst_id)
    return [TradeOut.model_validate(r) for r in rows]


# --- Algo orders: take-profit / stop-loss (OKX-hosted conditional/OCO) -------
def _ord_px(value: Optional[float]) -> str:
    """OKX algo order price: a value, or '-1' to execute at market on trigger."""
    return "-1" if value is None else str(value)


def place_algo(db: Session, req: AlgoOrderRequest, source: str = "manual") -> AlgoOrderOut:
    """Place a TP/SL algo order. Both TP and SL → OCO; one of them → conditional.
    Triggers are quantized to tickSz; size to lotSz (Decimal)."""
    rule = None
    try:
        rule = market_service.get_instrument_rule(req.inst_id)
    except Exception as exc:
        logger.warning("instrument rule unavailable for %s: %s", req.inst_id, exc)

    size_d = _quantize(req.size, rule.lot_sz if rule else None, ROUND_DOWN)
    if size_d <= 0:
        raise OrderValidationError("订单数量过小（按合约步长取整后为 0）。")
    tick = rule.tick_sz if rule else None

    has_tp = req.tp_trigger_px is not None
    has_sl = req.sl_trigger_px is not None
    ord_type = "oco" if (has_tp and has_sl) else "conditional"

    algo_cl = "dalgo" + shortuuid.uuid()[:14]
    params = dict(
        instId=req.inst_id,
        tdMode=req.td_mode,
        side=req.side,
        ordType=ord_type,
        sz=format(size_d.normalize(), "f"),
        algoClOrdId=algo_cl,
    )
    if req.reduce_only and req.inst_id.endswith("-SWAP"):
        params["reduceOnly"] = "true"
    if has_tp:
        params["tpTriggerPx"] = format(_quantize(req.tp_trigger_px, tick, ROUND_HALF_UP).normalize(), "f")
        params["tpOrdPx"] = _ord_px(req.tp_ord_px)
    if has_sl:
        params["slTriggerPx"] = format(_quantize(req.sl_trigger_px, tick, ROUND_HALF_UP).normalize(), "f")
        params["slOrdPx"] = _ord_px(req.sl_ord_px)

    resp = check(trade_api().place_algo_order(**params))
    algo_id = (resp.get("data") or [{}])[0].get("algoId")
    log_event(
        f"Placed {ord_type} TP/SL {req.side} {size_d} {req.inst_id}",
        category="order",
        detail={"algo_id": algo_id, "tp": req.tp_trigger_px, "sl": req.sl_trigger_px, "source": source},
        db=db,
        toast="success",
        toast_key="toast.order.placedTpsl",
        toast_vars={"type": ord_type, "side": req.side, "size": str(size_d), "inst": req.inst_id},
    )
    return AlgoOrderOut(
        algo_id=algo_id,
        algo_cl_ord_id=algo_cl,
        inst_id=req.inst_id,
        side=req.side,
        ord_type=ord_type,
        state="live",
        size=float(size_d),
        tp_trigger_px=req.tp_trigger_px,
        tp_ord_px=req.tp_ord_px,
        sl_trigger_px=req.sl_trigger_px,
        sl_ord_px=req.sl_ord_px,
        ts=int(time.time() * 1000),
    )


def place_trigger(db: Session, req: TriggerOrderRequest, source: str = "manual") -> AlgoOrderOut:
    """Place a standalone conditional (trigger) order via OKX algo orders."""
    rule = None
    try:
        rule = market_service.get_instrument_rule(req.inst_id)
    except Exception as exc:
        logger.warning("instrument rule unavailable for %s: %s", req.inst_id, exc)

    size_d = _quantize(req.size, rule.lot_sz if rule else None, ROUND_DOWN)
    if size_d <= 0:
        raise OrderValidationError("订单数量过小（按合约步长取整后为 0）。")
    tick = rule.tick_sz if rule else None
    trig = _quantize(req.trigger_px, tick, ROUND_HALF_UP)
    order_px = "-1" if req.order_px is None else format(_quantize(req.order_px, tick, ROUND_HALF_UP).normalize(), "f")

    algo_cl = "dtrg" + shortuuid.uuid()[:15]
    params = dict(
        instId=req.inst_id,
        tdMode=req.td_mode,
        side=req.side,
        ordType="trigger",
        sz=format(size_d.normalize(), "f"),
        triggerPx=format(trig.normalize(), "f"),
        orderPx=order_px,
        algoClOrdId=algo_cl,
    )
    if req.reduce_only and req.inst_id.endswith("-SWAP"):
        params["reduceOnly"] = "true"

    resp = check(trade_api().place_algo_order(**params))
    algo_id = (resp.get("data") or [{}])[0].get("algoId")
    log_event(
        f"Placed trigger {req.side} {size_d} {req.inst_id} @ trig {trig}",
        category="order", detail={"algo_id": algo_id, "source": source}, db=db, toast="success",
        toast_key="toast.order.placedTrigger",
        toast_vars={"side": req.side, "size": str(size_d), "inst": req.inst_id, "trig": str(trig)},
    )
    return AlgoOrderOut(
        algo_id=algo_id, algo_cl_ord_id=algo_cl, inst_id=req.inst_id, side=req.side,
        ord_type="trigger", state="live", size=float(size_d),
        trigger_px=req.trigger_px, order_px=req.order_px, ts=int(time.time() * 1000),
    )


def list_algos(inst_id: Optional[str] = None) -> List[AlgoOrderOut]:
    """List live algo orders from OKX (conditional + OCO + trigger)."""
    out: List[AlgoOrderOut] = []
    for ot in ("conditional", "oco", "trigger"):
        try:
            resp = check(trade_api().order_algos_list(ordType=ot, instId=inst_id or ""))
        except Exception as exc:
            logger.warning("order_algos_list(%s) failed: %s", ot, exc)
            continue
        for d in resp.get("data", []):
            out.append(
                AlgoOrderOut(
                    algo_id=d.get("algoId"),
                    algo_cl_ord_id=d.get("algoClOrdId") or None,
                    inst_id=d.get("instId"),
                    side=d.get("side"),
                    ord_type=d.get("ordType", ot),
                    state=d.get("state"),
                    size=_f(d.get("sz")) or None,
                    tp_trigger_px=_f(d.get("tpTriggerPx")) or None,
                    tp_ord_px=_f(d.get("tpOrdPx")) or None,
                    sl_trigger_px=_f(d.get("slTriggerPx")) or None,
                    sl_ord_px=_f(d.get("slOrdPx")) or None,
                    trigger_px=_f(d.get("triggerPx")) or None,
                    order_px=_f(d.get("orderPx")) or None,
                    ts=int(d["cTime"]) if d.get("cTime") else None,
                )
            )
    return out


def cancel_algo(db: Session, inst_id: str, algo_id: str) -> dict:
    resp = check(trade_api().cancel_algo_order([{"algoId": algo_id, "instId": inst_id}]))
    log_event(f"Cancelled algo order {algo_id} ({inst_id})", category="order", db=db, toast="info",
              toast_key="toast.order.cancelledAlgo", toast_vars={"id": algo_id, "inst": inst_id})
    return resp
