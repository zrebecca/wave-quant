import json
from datetime import datetime
from typing import Any, List, Tuple

from pydantic import BaseModel, Field, field_validator


class BacktestRequest(BaseModel):
    inst_id: str = "BTC-USDT-SWAP"
    bar: str = "1H"
    limit: int = Field(default=300, ge=50, le=1000)
    # sma_cross / momentum / rsi / bollinger / donchian / macd
    strategy: str = "sma_cross"
    fast: int = Field(default=10, ge=2, le=200)
    slow: int = Field(default=30, ge=3, le=400)
    # RSI mean-reversion
    rsi_len: int = Field(default=14, ge=2, le=100)
    rsi_low: float = Field(default=30, ge=1, le=50)
    rsi_high: float = Field(default=70, ge=50, le=99)
    # Bollinger band reversion
    boll_len: int = Field(default=20, ge=5, le=200)
    boll_k: float = Field(default=2.0, ge=0.5, le=5)
    # Donchian channel breakout
    donchian_len: int = Field(default=20, ge=5, le=200)
    # MACD trend
    macd_fast: int = Field(default=12, ge=2, le=100)
    macd_slow: int = Field(default=26, ge=3, le=200)
    macd_signal: int = Field(default=9, ge=2, le=100)
    initial_capital: float = Field(default=10000, gt=0)
    # Realistic cost model:
    fee_rate: float = Field(default=0.05, ge=0, le=1)      # taker fee per side, percent
    slippage_bp: float = Field(default=1.0, ge=0, le=100)  # slippage per fill, basis points


class BacktestResult(BaseModel):
    inst_id: str
    strategy: str
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    trade_count: int
    win_rate_pct: float
    profit_factor: float
    sharpe: float
    total_fee: float
    avg_holding_bars: float
    max_consecutive_losses: int
    final_equity: float
    equity_curve: List[Tuple[int, float]]    # [ts, equity]
    drawdown_curve: List[Tuple[int, float]]  # [ts, drawdown %]
    price_series: List[Tuple[int, float]]    # [ts, close]


class BacktestRunOut(BaseModel):
    """A persisted backtest run for the history list."""
    model_config = {"from_attributes": True}

    id: int
    created_at: datetime
    inst_id: str
    bar: str
    strategy: str
    limit_bars: int
    params: Any  # parsed back from the stored JSON string
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    sharpe: float
    trade_count: int
    win_rate_pct: float
    profit_factor: float
    total_fee: float
    final_equity: float

    @field_validator("params", mode="before")
    @classmethod
    def _parse_params(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except ValueError:
                return {}
        return v
