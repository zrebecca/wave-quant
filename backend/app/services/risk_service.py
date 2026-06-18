"""Risk evaluation + pre-trade enforcement.

Two layers of hard risk control:
  1. ``pre_order_breach`` — checked BEFORE every order (manual or bot). A breach
     means the order is rejected, so a risk limit cannot be bypassed by the UI.
  2. ``evaluate`` — a periodic portfolio check run by the bot loop; a breach
     triggers the configured action (alert / pause / cancel / stop / stop_close).

``evaluate`` is side-effect free (safe to call from polling). The bot loop is
responsible for acting on and persisting risk events.
"""
import logging
import time
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.order import Order, Trade
from app.repositories import order_repo
from app.repositories.config_repo import get_or_create_risk
from app.schemas.risk import RiskConfigOut, RiskStatusOut
from app.services import market_service, position_service

logger = logging.getLogger(__name__)


# --- Global Kill Switch -----------------------------------------------------
# In-memory trading-halt flag. When set, every new order is rejected by
# ``pre_order_breach`` regardless of the configured risk limits. (In-memory by
# design — a process restart clears the halt; persisting it is a later step.)
_HALT: dict = {"halted": False, "reason": None, "ts": None}


def halt_state() -> dict:
    return dict(_HALT)


def is_halted() -> bool:
    return bool(_HALT["halted"])


def set_halt(halted: bool, reason: Optional[str] = None) -> None:
    _HALT["halted"] = bool(halted)
    _HALT["reason"] = reason if halted else None
    _HALT["ts"] = int(time.time() * 1000) if halted else None


def kill_switch(db: Session, cancel_orders: bool = True, close_positions: bool = False, actor: str = "system") -> dict:
    """Global emergency stop: halt new orders, stop the bot, optionally cancel all
    open orders and/or market-close all positions. Cancel and close are separate
    switches to avoid accidental liquidation. Records a risk event + audit trail."""
    # Local imports avoid an import cycle (bot_manager/order_service ↔ risk_service).
    from app.services import audit_service, order_service
    from app.services.bot_manager import bot_manager

    set_halt(True, "手动 Kill Switch")  # block new orders immediately
    summary: dict = {"halted": True, "bot_stopped": False, "cancelled": 0, "closed": 0, "errors": []}

    try:
        bot_manager.emergency_stop()
        summary["bot_stopped"] = True
    except Exception as exc:
        summary["errors"].append(f"bot: {exc}")
    if cancel_orders:
        try:
            summary["cancelled"] = order_service.cancel_all(db)
        except Exception as exc:
            summary["errors"].append(f"cancel: {exc}")
    if close_positions:
        try:
            summary["closed"] = bot_manager.emergency_close()
        except Exception as exc:
            summary["errors"].append(f"close: {exc}")

    msg = (
        f"Kill Switch 触发 by {actor}：停机器人"
        + (f"、撤单 {summary['cancelled']}" if cancel_orders else "")
        + (f"、平仓 {summary['closed']}" if close_positions else "")
    )
    audit_service.record_risk_event("kill_switch", "halt", msg, level="ERROR", db=db)
    logger.warning(msg)
    return summary


def resume_trading(db: Session, actor: str = "system") -> dict:
    """Clear the Kill Switch halt so new orders are accepted again."""
    from app.services import audit_service

    set_halt(False)
    audit_service.record_risk_event("kill_switch", "resume", f"交易已恢复 by {actor}", level="INFO", db=db)
    return halt_state()


def _orders_last_minute(db: Session) -> int:
    cutoff = datetime.now() - timedelta(seconds=60)
    return db.scalar(select(func.count()).select_from(Order).where(Order.created_at >= cutoff)) or 0


def _cancels_last_minute(db: Session) -> int:
    cutoff = datetime.now() - timedelta(seconds=60)
    return (
        db.scalar(
            select(func.count())
            .select_from(Order)
            .where(Order.state == "canceled", Order.updated_at >= cutoff)
        )
        or 0
    )


def _consecutive_losses(db: Session) -> int:
    """Trailing run of losing fills (fill_pnl < 0) from the most recent trade."""
    rows = list(
        db.scalars(
            select(Trade.fill_pnl).where(Trade.fill_pnl.is_not(None)).order_by(Trade.id.desc()).limit(100)
        )
    )
    run = 0
    for pnl in rows:
        if pnl is not None and float(pnl) < 0:
            run += 1
        else:
            break
    return run


def _drawdown_pct(db: Session, current_equity: float) -> float:
    """Drawdown vs the recent peak equity from snapshots (percent)."""
    peak = db.scalar(select(func.max(Account.total_equity))) or 0
    peak = float(peak)
    if peak <= 0 or current_equity >= peak:
        return 0.0
    return (peak - current_equity) / peak * 100


def _signed(position: float, pos_side: str | None) -> float:
    """Signed position: long positive, short negative (net-mode pos already signed)."""
    if pos_side == "long":
        return abs(position)
    if pos_side == "short":
        return -abs(position)
    return position


def _ratio(value: float, limit: float) -> float:
    return (value / limit) if limit else 0.0


def evaluate(db: Session) -> RiskStatusOut:
    cfg = get_or_create_risk(db)
    positions = position_service.get_positions(db)

    position_notional = sum(abs(p.position) * (p.mark_px or 0) for p in positions)
    abs_position = sum(abs(p.position) for p in positions)
    net_position = sum(_signed(p.position, p.pos_side) for p in positions)
    open_orders = order_repo.count_open_orders(db)
    daily_pnl = sum(p.upl for p in positions)  # unrealized pnl as live daily-pnl proxy
    order_rate = _orders_last_minute(db)
    cancel_rate = _cancels_last_minute(db)
    consec_losses = _consecutive_losses(db)
    current_equity = float(db.scalar(select(Account.total_equity).order_by(Account.id.desc())) or 0)
    drawdown = _drawdown_pct(db, current_equity)

    breaches: List[str] = []
    if cfg.enabled:
        if abs_position > float(cfg.max_position):
            breaches.append(
                f"持仓 {abs_position:.4f} 超过最大持仓 {float(cfg.max_position):.4f}"
            )
        if net_position > float(cfg.max_net_long):
            breaches.append(
                f"净多 {net_position:.4f} 超过上限 {float(cfg.max_net_long):.4f}"
            )
        if -net_position > float(cfg.max_net_short):
            breaches.append(
                f"净空 {-net_position:.4f} 超过上限 {float(cfg.max_net_short):.4f}"
            )
        if position_notional > float(cfg.max_gross_exposure):
            breaches.append(
                f"风险敞口 {position_notional:.2f} 超过上限 {float(cfg.max_gross_exposure):.2f}"
            )
        if open_orders > cfg.max_open_orders:
            breaches.append(f"挂单数 {open_orders} 超过上限 {cfg.max_open_orders}")
        if daily_pnl < -abs(float(cfg.max_daily_loss)):
            breaches.append(
                f"当日盈亏 {daily_pnl:.2f} 低于最大亏损 -{float(cfg.max_daily_loss):.2f}"
            )
        if drawdown > float(cfg.max_drawdown):
            breaches.append(
                f"回撤 {drawdown:.2f}% 超过最大回撤 {float(cfg.max_drawdown):.2f}%"
            )
        if order_rate > cfg.max_order_rate:
            breaches.append(f"下单频率 {order_rate}/分钟 超过上限 {cfg.max_order_rate}")
        if cancel_rate > cfg.max_cancel_rate:
            breaches.append(f"撤单频率 {cancel_rate}/分钟 超过上限 {cfg.max_cancel_rate}")
        if consec_losses >= cfg.max_consecutive_losses:
            breaches.append(f"连续亏损 {consec_losses} 笔达到上限 {cfg.max_consecutive_losses}")

    usage = {
        "position": _ratio(abs_position, float(cfg.max_position)),
        "net_long": _ratio(max(net_position, 0), float(cfg.max_net_long)),
        "net_short": _ratio(max(-net_position, 0), float(cfg.max_net_short)),
        "gross_exposure": _ratio(position_notional, float(cfg.max_gross_exposure)),
        "open_orders": _ratio(open_orders, cfg.max_open_orders),
        "daily_loss": _ratio(max(-daily_pnl, 0), float(cfg.max_daily_loss)),
        "order_rate": _ratio(order_rate, cfg.max_order_rate),
        "cancel_rate": _ratio(cancel_rate, cfg.max_cancel_rate),
        "consecutive_losses": _ratio(consec_losses, cfg.max_consecutive_losses),
        "drawdown": _ratio(drawdown, float(cfg.max_drawdown)),
    }

    return RiskStatusOut(
        config=RiskConfigOut.model_validate(cfg),
        current_position_notional=position_notional,
        open_order_count=open_orders,
        daily_pnl=daily_pnl,
        net_position=net_position,
        gross_exposure=position_notional,
        breaches=breaches,
        triggered=bool(breaches),
        action=cfg.on_breach_action,
        usage=usage,
    )


def check_order_notional(db: Session, notional: float) -> Optional[str]:
    """Return a breach message if a prospective order exceeds max_order_notional."""
    cfg = get_or_create_risk(db)
    if cfg.enabled and notional > float(cfg.max_order_notional):
        return (
            f"订单名义 {notional:.2f} 超过单笔上限 {float(cfg.max_order_notional):.2f}"
        )
    return None


def pre_order_breach(
    db: Session, inst_id: str, side: str, size: float, price: Optional[float]
) -> Optional[str]:
    """Hard pre-trade check. Returns a breach message (reject) or None (allow).

    Enforces: single-order notional, max open orders, and the projected net
    position against max_position / max_net_long / max_net_short.
    """
    # 0) global Kill Switch halt — blocks ALL new orders regardless of risk config.
    if _HALT["halted"]:
        return f"交易已被紧急停止（Kill Switch）：{_HALT['reason'] or '已暂停下单'}"

    cfg = get_or_create_risk(db)
    if not cfg.enabled:
        return None

    # 1) single-order notional — contract qty × price × coin-per-contract (spot: ×1)
    if price:
        notional = size * price * market_service.contract_value(inst_id)
        if notional > float(cfg.max_order_notional):
            return f"订单名义 {notional:.2f} 超过单笔上限 {float(cfg.max_order_notional):.2f}"

    # 2) open order count
    if order_repo.count_open_orders(db) + 1 > cfg.max_open_orders:
        return f"挂单数已达上限 {cfg.max_open_orders}"

    # 2b) order rate (placements per minute)
    if _orders_last_minute(db) + 1 > cfg.max_order_rate:
        return f"下单频率超过上限 {cfg.max_order_rate}/分钟"

    # 3) projected net position after this fill
    positions = position_service.get_positions(db)
    net = sum(_signed(p.position, p.pos_side) for p in positions)
    delta = size if side == "buy" else -size
    projected = net + delta
    if abs(projected) > float(cfg.max_position):
        return f"成交后持仓 {abs(projected):.4f} 将超过最大持仓 {float(cfg.max_position):.4f}"
    if projected > float(cfg.max_net_long):
        return f"成交后净多 {projected:.4f} 将超过上限 {float(cfg.max_net_long):.4f}"
    if -projected > float(cfg.max_net_short):
        return f"成交后净空 {-projected:.4f} 将超过上限 {float(cfg.max_net_short):.4f}"
    return None


def market_delay_breach(db: Session, ticker_ts: Optional[int]) -> Optional[str]:
    """Return a breach message if market data is staler than max_market_delay_sec."""
    cfg = get_or_create_risk(db)
    if not cfg.enabled or not ticker_ts:
        return None
    delay = time.time() * 1000 - ticker_ts
    if delay > cfg.max_market_delay_sec * 1000:
        return f"行情延迟 {delay / 1000:.1f}s 超过上限 {cfg.max_market_delay_sec}s"
    return None
