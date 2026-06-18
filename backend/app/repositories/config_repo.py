"""CRUD for strategy/risk configs and bot status, with default seeding."""
import json
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.bot import BotStatus
from app.models.config import RiskConfig, StrategyConfig
from app.models.strategy_version import StrategyVersion

DEFAULT_NAME = "default"

# Strategy parameter fields captured in a version snapshot.
STRATEGY_PARAM_FIELDS = (
    "inst_id",
    "order_size",
    "spread",
    "refresh_interval",
    "max_position",
    "num_levels",
    "is_active",
    "strategy_type",
    "ma_fast",
    "ma_slow",
    "ma_bar",
    "rsi_len",
    "rsi_low",
    "rsi_high",
    "boll_len",
    "boll_k",
)

# Parameter fields stored as decimals — coerced to float in snapshots.
_FLOAT_PARAMS = ("order_size", "spread", "max_position", "rsi_low", "rsi_high", "boll_k")


def strategy_params(cfg: StrategyConfig) -> dict:
    """Extract the parameter set from a strategy config (floats coerced)."""
    out: dict = {}
    for f in STRATEGY_PARAM_FIELDS:
        v = getattr(cfg, f)
        out[f] = float(v) if f in _FLOAT_PARAMS else v
    return out


def get_strategy_by_name(db: Session, name: str) -> Optional[StrategyConfig]:
    """Read-only lookup — never seeds a row (use in polled/idempotent paths)."""
    return db.scalar(select(StrategyConfig).where(StrategyConfig.name == name))


def first_strategy(db: Session) -> Optional[StrategyConfig]:
    """Lowest-id strategy instance, or None when the table is empty."""
    return db.scalar(select(StrategyConfig).order_by(StrategyConfig.id).limit(1))


def get_or_create_strategy(db: Session, name: str = DEFAULT_NAME) -> StrategyConfig:
    cfg = db.scalar(select(StrategyConfig).where(StrategyConfig.name == name))
    if cfg is None:
        cfg = StrategyConfig(name=name)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def update_strategy(db: Session, fields: dict, name: str = DEFAULT_NAME) -> StrategyConfig:
    cfg = get_or_create_strategy(db, name)
    for key, value in fields.items():
        if value is not None and hasattr(cfg, key):
            setattr(cfg, key, value)
    db.commit()
    db.refresh(cfg)
    return cfg


# ---- strategy instances (CRUD over named configs) ----

def list_strategies(db: Session, owner_id: Optional[int] = None) -> List[StrategyConfig]:
    """List strategy instances. When owner_id is given, scope to that user's
    own instances (used by 我的策略 so each account only sees what it created)."""
    stmt = select(StrategyConfig).order_by(StrategyConfig.id)
    if owner_id is not None:
        stmt = stmt.where(StrategyConfig.owner_id == owner_id)
    return list(db.scalars(stmt))


def create_strategy(
    db: Session, name: str, fields: dict, owner_id: Optional[int] = None
) -> StrategyConfig:
    cfg = StrategyConfig(name=name, owner_id=owner_id)
    for key, value in fields.items():
        if value is not None and hasattr(cfg, key) and key != "name":
            setattr(cfg, key, value)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def delete_strategy(db: Session, name: str) -> None:
    cfg = db.scalar(select(StrategyConfig).where(StrategyConfig.name == name))
    if cfg is not None:
        db.delete(cfg)
        db.commit()


def get_or_create_risk(db: Session, name: str = DEFAULT_NAME) -> RiskConfig:
    cfg = db.scalar(select(RiskConfig).where(RiskConfig.name == name))
    if cfg is None:
        cfg = RiskConfig(name=name)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def update_risk(db: Session, fields: dict, name: str = DEFAULT_NAME) -> RiskConfig:
    cfg = get_or_create_risk(db, name)
    for key, value in fields.items():
        if value is not None and hasattr(cfg, key):
            setattr(cfg, key, value)
    db.commit()
    db.refresh(cfg)
    return cfg


# ---- strategy versions ----

def create_strategy_version(
    db: Session, cfg: StrategyConfig, note: Optional[str] = None, created_by: str = "system"
) -> StrategyVersion:
    next_ver = (
        db.scalar(
            select(func.max(StrategyVersion.version)).where(
                StrategyVersion.strategy_name == cfg.name
            )
        )
        or 0
    ) + 1
    ver = StrategyVersion(
        strategy_name=cfg.name,
        version=next_ver,
        params=json.dumps(strategy_params(cfg), default=str),
        note=note,
        created_by=created_by,
    )
    db.add(ver)
    db.commit()
    db.refresh(ver)
    return ver


def list_strategy_versions(
    db: Session, name: str = DEFAULT_NAME, limit: int = 100
) -> List[StrategyVersion]:
    return list(
        db.scalars(
            select(StrategyVersion)
            .where(StrategyVersion.strategy_name == name)
            .order_by(StrategyVersion.version.desc())
            .limit(limit)
        )
    )


def get_strategy_version(
    db: Session, version: int, name: str = DEFAULT_NAME
) -> Optional[StrategyVersion]:
    return db.scalar(
        select(StrategyVersion).where(
            StrategyVersion.strategy_name == name, StrategyVersion.version == version
        )
    )


def latest_strategy_version(db: Session, name: str = DEFAULT_NAME) -> Optional[int]:
    return db.scalar(
        select(func.max(StrategyVersion.version)).where(StrategyVersion.strategy_name == name)
    )


def get_or_create_bot_status(db: Session) -> BotStatus:
    status: Optional[BotStatus] = db.scalar(select(BotStatus).limit(1))
    if status is None:
        status = BotStatus(state="STOPPED", strategy_name=DEFAULT_NAME)
        db.add(status)
        db.commit()
        db.refresh(status)
    return status


def update_bot_status(db: Session, **fields) -> BotStatus:
    status = get_or_create_bot_status(db)
    for key, value in fields.items():
        if hasattr(status, key):
            setattr(status, key, value)
    db.commit()
    db.refresh(status)
    return status
