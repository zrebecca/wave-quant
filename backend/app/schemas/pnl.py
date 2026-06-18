"""Realized-PnL / trading-activity summary, aggregated from the fills table."""
from typing import List, Optional

from pydantic import BaseModel


class PnlInstrument(BaseModel):
    inst_id: str
    realized_pnl: float        # Σ fillPnl (closing fills)
    fees: float                # Σ fee (OKX fees are negative = cost)
    net_pnl: float             # realized_pnl + fees
    volume: float              # Σ |fillPx · fillSz| (USD notional)
    trades: int                # fill count
    maker: int                 # maker fills
    taker: int                 # taker fills
    wins: int                  # closing fills with pnl > 0
    closes: int                # closing fills (pnl != 0)
    win_rate: float            # wins / closes · 100


class PnlSummary(BaseModel):
    since_days: Optional[int] = None
    total_realized: float
    total_fees: float
    total_net: float
    total_volume: float
    total_trades: int
    win_rate: float
    profit_factor: Optional[float] = None  # Σ gains / |Σ losses|; None if no losses
    instruments: List[PnlInstrument]
