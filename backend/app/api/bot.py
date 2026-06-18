from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.order import Trade
from app.models.user import User
from app.repositories import config_repo, order_repo
from app.repositories.config_repo import get_or_create_bot_status
from app.schemas.bot import BotRuntimeOut, BotStatusOut, StopBotRequest
from app.schemas.common import MessageResponse
from app.services import audit_service, risk_service
from app.services.bot_manager import bot_manager

router = APIRouter()


def _state(db: Session) -> BotStatusOut:
    return BotStatusOut.model_validate(get_or_create_bot_status(db))


@router.get("/bot", response_model=BotStatusOut)
def bot_status(db: Session = Depends(get_db)):
    return _state(db)


@router.get("/bot/runtime", response_model=BotRuntimeOut)
def bot_runtime(db: Session = Depends(get_db)):
    """Aggregated runtime detail for the bot console."""
    status = get_or_create_bot_status(db)
    # Read-only: this endpoint is polled by the UI, so it must never re-seed a
    # strategy the user deleted. Resolve the bot's active instance, fall back to
    # any existing instance, else leave inst_id null.
    strategy = (
        config_repo.get_strategy_by_name(db, status.strategy_name)
        or config_repo.first_strategy(db)
    )

    open_orders = order_repo.list_orders(db, open_only=True)
    bot_open = [o for o in open_orders if o.source == "bot"]
    open_buy = sum(1 for o in bot_open if o.side == "buy")
    open_sell = sum(1 for o in bot_open if o.side == "sell")

    midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trades = list(db.scalars(select(Trade).where(Trade.created_at >= midnight)))
    today_fills = len(today_trades)
    maker_fills = sum(1 for tr in today_trades if tr.exec_type == "M")
    today_fee = sum(float(tr.fee or 0) for tr in today_trades)
    maker_ratio = (maker_fills / today_fills) if today_fills else None

    # Reuse the risk engine for net position / gross exposure (best-effort).
    net_position = gross_exposure = 0.0
    try:
        risk = risk_service.evaluate(db)
        net_position = risk.net_position
        gross_exposure = risk.gross_exposure
    except Exception:
        pass

    last_error = status.message if status.state in ("ERROR", "RISK_STOPPED") else None

    return BotRuntimeOut(
        state=status.state,
        strategy_name=status.strategy_name,
        strategy_version=status.strategy_version,
        inst_id=strategy.inst_id if strategy else None,
        started_at=status.started_at,
        last_heartbeat=status.last_heartbeat,
        last_quote_ts=status.last_quote_ts,
        cycles=status.cycles,
        open_buy=open_buy,
        open_sell=open_sell,
        today_fills=today_fills,
        maker_fills=maker_fills,
        maker_ratio=maker_ratio,
        today_fee=today_fee,
        net_position=net_position,
        gross_exposure=gross_exposure,
        last_error=last_error,
    )


@router.post("/bot/start", response_model=BotStatusOut)
def bot_start(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_or_create_bot_status(db).state
    bot_manager.start()
    out = _state(db)
    audit_service.record_audit(admin.username, "bot.start", before=before, after=out.state, db=db)
    return out


@router.post("/bot/pause", response_model=BotStatusOut)
def bot_pause(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_or_create_bot_status(db).state
    bot_manager.pause()
    out = _state(db)
    audit_service.record_audit(admin.username, "bot.pause", before=before, after=out.state, db=db)
    return out


@router.post("/bot/resume", response_model=BotStatusOut)
def bot_resume(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_or_create_bot_status(db).state
    bot_manager.resume()
    out = _state(db)
    audit_service.record_audit(admin.username, "bot.resume", before=before, after=out.state, db=db)
    return out


@router.post("/bot/stop", response_model=BotStatusOut)
def bot_stop(
    req: StopBotRequest | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    mode = req.mode if req else "cancel"
    before = get_or_create_bot_status(db).state
    bot_manager.stop(mode=mode, reason=(req.reason if req and req.reason else "manual stop"))
    out = _state(db)
    audit_service.record_audit(
        admin.username, "bot.stop", target=mode, before=before, after=out.state, db=db
    )
    return out


@router.post("/bot/restart", response_model=BotStatusOut)
def bot_restart(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_or_create_bot_status(db).state
    bot_manager.restart()
    out = _state(db)
    audit_service.record_audit(admin.username, "bot.restart", before=before, after=out.state, db=db)
    return out


@router.post("/bot/apply-strategy", response_model=BotStatusOut)
def bot_apply_strategy(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    version = bot_manager.apply_strategy()
    out = _state(db)
    audit_service.record_audit(
        admin.username, "bot.apply_strategy", after=f"v{version}", db=db
    )
    return out


@router.post("/bot/emergency-stop", response_model=BotStatusOut)
def bot_emergency_stop(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    before = get_or_create_bot_status(db).state
    bot_manager.emergency_stop()
    out = _state(db)
    audit_service.record_audit(
        admin.username, "bot.emergency_stop", before=before, after=out.state, result="ok", db=db
    )
    return out


@router.post("/bot/emergency-close", response_model=MessageResponse)
def bot_emergency_close(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    closed = bot_manager.emergency_close()
    audit_service.record_audit(
        admin.username, "bot.emergency_close", after=f"closed {closed}", db=db
    )
    return MessageResponse(msg=f"closed {closed} positions")
