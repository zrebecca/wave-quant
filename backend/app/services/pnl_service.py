"""Realized PnL + trading activity, aggregated from the local fills (trades) table.

Pure read model over what the order/fill feed already persists — realized pnl per
closing fill (OKX ``fillPnl``), fees, maker/taker mix, volume and win rate — grouped
by instrument with overall totals. No external calls.
"""
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Trade
from app.schemas.pnl import PnlInstrument, PnlSummary


def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


class _Acc:
    __slots__ = ("realized", "fees", "volume", "trades", "maker", "taker", "wins", "closes", "gain", "loss")

    def __init__(self):
        self.realized = self.fees = self.volume = 0.0
        self.trades = self.maker = self.taker = self.wins = self.closes = 0
        self.gain = self.loss = 0.0

    def add(self, t: Trade) -> None:
        pnl = _f(t.fill_pnl)
        self.realized += pnl
        self.fees += _f(t.fee)
        self.volume += _f(t.fill_px) * _f(t.fill_sz)
        self.trades += 1
        if t.exec_type == "M":
            self.maker += 1
        elif t.exec_type == "T":
            self.taker += 1
        if pnl != 0:
            self.closes += 1
            if pnl > 0:
                self.wins += 1
                self.gain += pnl
            else:
                self.loss += -pnl


def summary(db: Session, days: Optional[int] = None) -> PnlSummary:
    stmt = select(Trade)
    if days:
        cutoff_ms = int(time.time() * 1000) - days * 86_400_000
        stmt = stmt.where(Trade.ts >= cutoff_ms)
    trades = list(db.scalars(stmt))

    per: dict[str, _Acc] = {}
    total = _Acc()
    for t in trades:
        per.setdefault(t.inst_id, _Acc()).add(t)
        total.add(t)

    instruments = [
        PnlInstrument(
            inst_id=inst,
            realized_pnl=round(a.realized, 8),
            fees=round(a.fees, 8),
            net_pnl=round(a.realized + a.fees, 8),
            volume=round(a.volume, 2),
            trades=a.trades,
            maker=a.maker,
            taker=a.taker,
            wins=a.wins,
            closes=a.closes,
            win_rate=round(a.wins / a.closes * 100, 2) if a.closes else 0.0,
        )
        for inst, a in sorted(per.items(), key=lambda kv: kv[1].realized, reverse=True)
    ]

    return PnlSummary(
        since_days=days,
        total_realized=round(total.realized, 8),
        total_fees=round(total.fees, 8),
        total_net=round(total.realized + total.fees, 8),
        total_volume=round(total.volume, 2),
        total_trades=total.trades,
        win_rate=round(total.wins / total.closes * 100, 2) if total.closes else 0.0,
        profit_factor=round(total.gain / total.loss, 2) if total.loss > 0 else None,
        instruments=instruments,
    )
