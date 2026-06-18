"""Account equity / balance, sourced from OKX and persisted as snapshots."""
import logging
import time

from sqlalchemy.orm import Session

from sqlalchemy import select

from app.models.account import Account
from app.repositories import order_repo
from app.repositories.config_repo import get_or_create_bot_status
from app.schemas.account import (
    AccountConfigOut,
    AccountDetailOut,
    AccountOut,
    EquityPoint,
    LeverageOut,
)
from app.services import position_service
from app.services.live_state import live
from app.services.okx_client import account_api, check

logger = logging.getLogger(__name__)


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_details(raw_details: list) -> list[AccountDetailOut]:
    """Per-currency breakdown, skipping dust (no equity and no balance)."""
    out: list[AccountDetailOut] = []
    for item in raw_details:
        eq = _f(item.get("eq"))
        avail = _f(item.get("availBal"))
        frozen = _f(item.get("frozenBal"))
        if eq == 0 and avail == 0 and frozen == 0:
            continue
        out.append(
            AccountDetailOut(
                ccy=item.get("ccy", "?"),
                eq=eq,
                eq_usd=_f(item.get("eqUsd")),
                avail_bal=avail,
                frozen_bal=frozen,
                upl=_f(item.get("upl")),
            )
        )
    # Largest USD value first.
    out.sort(key=lambda x: x.eq_usd, reverse=True)
    return out


def get_equity_history(db: Session, limit: int = 200) -> list[EquityPoint]:
    """Recent equity snapshots (oldest→newest) from the accounts table."""
    rows = list(
        db.scalars(select(Account).order_by(Account.id.desc()).limit(limit))
    )
    rows.reverse()
    return [
        EquityPoint(
            ts=int(r.created_at.timestamp() * 1000),
            total_equity=float(r.total_equity),
            available_balance=float(r.available_balance),
            unrealized_pnl=float(r.unrealized_pnl),
        )
        for r in rows
    ]


def get_account_summary(db: Session) -> AccountOut:
    # Prefer the real-time account snapshot from the private WS when connected
    # and it carries the per-ccy breakdown; otherwise pull over REST.
    acct = live.account() if live.account_fresh() else None
    if acct and acct.get("details"):
        d = acct
    else:
        d = check(account_api().get_account_balance())["data"][0]
    total_equity = _f(d.get("totalEq"))
    raw_details = d.get("details", [])
    # Available balance: sum of availBal across detail entries (USDT-denominated demo).
    avail = sum(_f(item.get("availBal")) for item in raw_details)
    upl = sum(_f(item.get("upl")) for item in raw_details)
    mgn_ratio = _f(d.get("mgnRatio")) or None

    positions = position_service.get_positions(db)
    open_orders = order_repo.count_open_orders(db)
    bot = get_or_create_bot_status(db)

    # Persist a snapshot row for history.
    snapshot = Account(
        total_equity=total_equity,
        available_balance=avail,
        unrealized_pnl=upl,
        margin_ratio=mgn_ratio,
        currency="USDT",
    )
    db.add(snapshot)
    db.commit()

    return AccountOut(
        total_equity=total_equity,
        available_balance=avail,
        unrealized_pnl=upl,
        margin_ratio=mgn_ratio,
        currency="USDT",
        position_count=len(positions),
        open_order_count=open_orders,
        bot_state=bot.state,
        details=_build_details(raw_details),
        source="OKX Demo Trading",
        ts=int(time.time() * 1000),
    )


def get_config() -> AccountConfigOut:
    """Account-level trade config from OKX (position mode)."""
    resp = check(account_api().get_account_config())
    d = (resp.get("data") or [{}])[0]
    return AccountConfigOut(pos_mode=d.get("posMode", "net_mode"))


def set_position_mode(pos_mode: str) -> AccountConfigOut:
    """Switch hedge (long_short_mode) / one-way (net_mode). OKX rejects the
    change while there are open positions or pending orders."""
    check(account_api().set_position_mode(posMode=pos_mode))
    return AccountConfigOut(pos_mode=pos_mode)


def get_leverage(inst_id: str, mgn_mode: str) -> LeverageOut:
    resp = check(account_api().get_leverage(mgnMode=mgn_mode, instId=inst_id))
    data = resp.get("data") or []
    lever = float(data[0].get("lever") or 0) if data else 0.0
    return LeverageOut(inst_id=inst_id, mgn_mode=mgn_mode, lever=lever)


def set_leverage(inst_id: str, lever: float, mgn_mode: str) -> LeverageOut:
    # OKX expects an integer-like string; trim trailing .0 for readability.
    lever_str = str(int(lever)) if float(lever).is_integer() else str(lever)
    check(account_api().set_leverage(lever=lever_str, mgnMode=mgn_mode, instId=inst_id))
    return get_leverage(inst_id, mgn_mode)
