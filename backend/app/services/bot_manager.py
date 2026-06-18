"""Trading bot lifecycle + market-making loop (Demo Trading only).

The bot runs in a daemon thread inside the FastAPI process. Each cycle it:
  1. dynamically reloads the strategy config from MySQL,
  2. runs the risk check — a breach fires the configured action
     (alert / pause / cancel / stop / stop_close),
  3. (unless paused) refreshes a simple two-sided quote around the mid price.

State machine: STOPPED → STARTING → RUNNING ⇄ PAUSED → STOPPING → STOPPED,
with ERROR / RISK_STOPPED as terminal halt states. States are persisted to
``bot_status`` and streamed to the frontend.
"""
import logging
import threading
import time
from types import SimpleNamespace
from typing import Optional

from app.core.database import session_scope
from app.models.bot import (
    BOT_ERROR,
    BOT_PAUSED,
    BOT_RISK_STOPPED,
    BOT_RUNNING,
    BOT_STARTING,
    BOT_STOPPED,
    BOT_STOPPING,
)
from app.repositories import config_repo, order_repo
from app.schemas.order import CancelOrderRequest, PlaceOrderRequest
from app.services import audit_service, market_service, order_service, position_service, risk_service, strategies
from app.services.log_service import log_event
from app.services.okx_client import OkxError
from app.services.ws_manager import hub

logger = logging.getLogger(__name__)

# Valid stop modes for stop().
STOP_KEEP = "keep"            # stop quoting, leave existing orders on the book
STOP_CANCEL = "cancel"        # stop and cancel this bot's orders (default)
STOP_CANCEL_CLOSE = "cancel_close"  # stop, cancel orders and close positions


def _now_ms() -> int:
    return int(time.time() * 1000)


class BotManager:
    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._pause = threading.Event()
        # Set by wake() (from the private-WS thread on a fill) to cut the sleep
        # short so the strategy re-evaluates immediately — the event-driven loop.
        self._wake = threading.Event()
        self._lock = threading.Lock()
        # Strategy params are PINNED at start; editing the strategy while running
        # does NOT affect the bot until apply_strategy() (or restart) re-pins them.
        self._params: Optional[SimpleNamespace] = None
        # Which named strategy instance the bot runs (persisted in bot_status).
        self._active_name: str = "default"
        # Mid price of the last quote refresh — used to skip needless cancel/replace
        # churn when the market hasn't moved and our quotes are still on the book.
        self._last_quote_mid: Optional[float] = None

    # ---- lifecycle ----
    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> str:
        with self._lock:
            if self.is_running:
                # Already alive — treat start as "resume" if paused.
                if self._pause.is_set():
                    self._pause.clear()
                    self._set_state(BOT_RUNNING, "resumed")
                    log_event("Bot resumed", category="bot")
                    self._broadcast()
                return BOT_RUNNING
            self._stop.clear()
            self._pause.clear()
            self._wake.clear()
            self._last_quote_mid = None
            self._set_state(BOT_STARTING, "starting")
            self._broadcast()
            # Resolve which named instance to run (persisted in bot_status).
            with session_scope() as db:
                self._active_name = config_repo.get_or_create_bot_status(db).strategy_name or "default"
            # Pin params + bind this run to a fixed strategy version.
            self._params = self._load_params()
            version = self._bind_strategy_version()
            self._thread = threading.Thread(target=self._run, name="bot-loop", daemon=True)
            self._thread.start()
            self._set_state(
                BOT_RUNNING, "bot started", started_at=_now_ms(), strategy_version=version
            )
            log_event("Bot started", category="bot")
            self._broadcast()
            return BOT_RUNNING

    def wake(self, reason: str = "event") -> None:
        """Ask the loop to re-evaluate now instead of waiting out the sleep.

        Called from the private-WS thread when a fill arrives so the strategy
        reacts to the new position immediately. No-op unless actively running.
        """
        if self.is_running and not self._pause.is_set():
            self._wake.set()

    def pause(self) -> str:
        """Stop placing new quotes but keep the thread alive and orders on the book."""
        if not self.is_running:
            return BOT_STOPPED
        self._pause.set()
        self._set_state(BOT_PAUSED, "paused (quoting suspended)")
        log_event("Bot paused", category="bot")
        self._broadcast()
        return BOT_PAUSED

    def resume(self) -> str:
        if not self.is_running:
            return BOT_STOPPED
        self._pause.clear()
        self._set_state(BOT_RUNNING, "resumed")
        log_event("Bot resumed", category="bot")
        self._broadcast()
        return BOT_RUNNING

    def stop(self, mode: str = STOP_CANCEL, reason: str = "manual stop") -> str:
        """Stop the bot. mode: keep | cancel | cancel_close."""
        self._set_state(BOT_STOPPING, f"stopping ({mode})")
        self._broadcast()
        with self._lock:
            self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)

        if mode in (STOP_CANCEL, STOP_CANCEL_CLOSE):
            self._cancel_bot_orders()
        if mode == STOP_CANCEL_CLOSE:
            self._close_all_positions()

        self._set_state(BOT_STOPPED, reason)
        log_event(f"Bot stopped ({mode}): {reason}", category="bot")
        self._broadcast()
        return BOT_STOPPED

    def run_instance(self, name: str) -> str:
        """Switch the active strategy instance and (re)start the bot on it."""
        if self.is_running:
            self.stop(STOP_CANCEL, f"switching to {name}")
            time.sleep(0.5)
        self._active_name = name
        with session_scope() as db:
            config_repo.update_bot_status(db, strategy_name=name)
        return self.start()

    def restart(self) -> str:
        self.stop(STOP_CANCEL, "restart")
        time.sleep(0.5)
        return self.start()

    def emergency_stop(self) -> str:
        """Hard stop: halt the loop and cancel ALL open orders (every source)."""
        with self._lock:
            self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        cancelled = self._cancel_all_orders()
        self._set_state(BOT_STOPPED, "EMERGENCY STOP — all orders cancelled")
        log_event(
            f"EMERGENCY STOP — cancelled {cancelled} orders",
            category="risk",
            level="ERROR",
            toast="error",
            toast_key="toast.bot.emergencyStop",
            toast_vars={"count": cancelled},
        )
        self._broadcast()
        return BOT_STOPPED

    def emergency_close(self) -> int:
        """Market-close every open position. Returns the number closed."""
        closed = self._close_all_positions()
        log_event(
            f"EMERGENCY CLOSE — closed {closed} positions",
            category="risk",
            level="ERROR",
            toast="error",
            toast_key="toast.bot.emergencyClose",
            toast_vars={"count": closed},
        )
        self._broadcast()
        return closed

    def _load_params(self) -> SimpleNamespace:
        """Snapshot the current strategy config into a plain namespace (pinned)."""
        with session_scope() as db:
            cfg = config_repo.get_or_create_strategy(db, name=self._active_name)
            return SimpleNamespace(
                inst_id=cfg.inst_id,
                order_size=float(cfg.order_size),
                spread=float(cfg.spread),
                refresh_interval=int(cfg.refresh_interval),
                max_position=float(cfg.max_position),
                num_levels=int(cfg.num_levels),
                is_active=bool(cfg.is_active),
                strategy_type=getattr(cfg, "strategy_type", "market_maker"),
                ma_fast=int(getattr(cfg, "ma_fast", 5)),
                ma_slow=int(getattr(cfg, "ma_slow", 20)),
                ma_bar=getattr(cfg, "ma_bar", "1H"),
                rsi_len=int(getattr(cfg, "rsi_len", 14)),
                rsi_low=float(getattr(cfg, "rsi_low", 30)),
                rsi_high=float(getattr(cfg, "rsi_high", 70)),
                boll_len=int(getattr(cfg, "boll_len", 20)),
                boll_k=float(getattr(cfg, "boll_k", 2)),
                tp_pct=float(getattr(cfg, "tp_pct", 0) or 0),
                sl_pct=float(getattr(cfg, "sl_pct", 0) or 0),
                entry_taker=bool(getattr(cfg, "entry_taker", True)),
                max_slice=float(getattr(cfg, "max_slice", 0) or 0),
            )

    def apply_strategy(self) -> Optional[int]:
        """Re-pin the running bot to the current strategy config + latest version."""
        if not self.is_running:
            return None
        self._params = self._load_params()
        version = self._bind_strategy_version()
        self._set_state(BOT_RUNNING, "applied latest strategy", strategy_version=version)
        log_event(f"Applied latest strategy (v{version})", category="bot", toast="success",
                  toast_key="toast.bot.applied", toast_vars={"version": version})
        self._broadcast()
        return version

    def _bind_strategy_version(self) -> Optional[int]:
        """Pin the run to the latest strategy version, creating one if none exists."""
        try:
            with session_scope() as db:
                version = config_repo.latest_strategy_version(db, name=self._active_name)
                if version is None:
                    cfg = config_repo.get_or_create_strategy(db, name=self._active_name)
                    version = config_repo.create_strategy_version(
                        db, cfg, note="auto-snapshot on bot start", created_by="bot"
                    ).version
                return version
        except Exception as exc:
            logger.error("failed to bind strategy version: %s", exc)
            return None

    # ---- state helpers ----
    def _set_state(self, state: str, message: str, **extra) -> None:
        try:
            with session_scope() as db:
                config_repo.update_bot_status(db, state=state, message=message, **extra)
        except Exception as exc:
            logger.error("failed to persist bot state: %s", exc)

    def _broadcast(self) -> None:
        try:
            with session_scope() as db:
                status = config_repo.get_or_create_bot_status(db)
                hub.publish_threadsafe(
                    "bot",
                    {
                        "state": status.state,
                        "message": status.message,
                        "cycles": status.cycles,
                        "last_heartbeat": status.last_heartbeat,
                        "last_quote_ts": status.last_quote_ts,
                    },
                )
        except Exception:
            pass

    # ---- main loop ----
    def _run(self) -> None:
        cycles = 0
        while not self._stop.is_set():
            interval = 5
            try:
                with session_scope() as db:
                    # Use the PINNED params (not a live reload) — edits apply only
                    # via apply_strategy() / restart.
                    cfg = self._params or self._load_params()
                    interval = max(1, int(cfg.refresh_interval))

                    # 1) risk gate — may break the loop depending on the action
                    risk = risk_service.evaluate(db)
                    if risk.triggered and self._apply_risk_action(db, risk):
                        break

                    # 2) act (skip while paused or strategy inactive). Dispatch by
                    #    strategy type: market maker quotes inline, others run via strategies.
                    if not self._pause.is_set() and cfg.is_active and not risk.triggered:
                        if getattr(cfg, "strategy_type", "market_maker") == "market_maker":
                            self._refresh_quotes(db, cfg)
                        else:
                            strategies.run_strategy(db, cfg)
                        config_repo.update_bot_status(db, last_quote_ts=_now_ms())

                    cycles += 1
                    state = BOT_PAUSED if self._pause.is_set() else BOT_RUNNING
                    config_repo.update_bot_status(
                        db, cycles=cycles, last_heartbeat=_now_ms(), state=state, message="ok"
                    )
                self._broadcast()
            except OkxError as exc:
                log_event(f"Bot OKX error: {exc.msg}", category="error", level="ERROR", toast="error",
                          toast_key="toast.bot.okxError", toast_vars={"msg": exc.msg})
            except Exception as exc:
                logger.exception("bot loop error")
                log_event(f"Bot error: {exc}", category="error", level="ERROR")
                self._set_state(BOT_ERROR, str(exc))
                self._broadcast()
            # Sleep in small slices so stop() is responsive; a fill event (via
            # wake()) cuts the wait short so the strategy re-evaluates at once.
            woke = False
            for _ in range(int(interval * 2)):
                if self._stop.is_set():
                    break
                if self._wake.is_set():
                    self._wake.clear()
                    woke = True
                    break
                time.sleep(0.5)
            # Small floor so a burst of fills can't hot-loop the bot.
            if woke and not self._stop.is_set():
                time.sleep(0.2)

    def _apply_risk_action(self, db, risk) -> bool:
        """React to a risk breach per the configured action.

        Returns True if the loop should terminate (stop / stop_close).
        """
        msg = "; ".join(risk.breaches)
        action = risk.action
        # Persist a risk event + log + toast.
        audit_service.record_risk_event(
            rule="portfolio",
            action=action,
            message=msg,
            level="ERROR" if action in ("stop", "stop_close") else "WARNING",
            db=db,
        )
        log_event(f"RISK [{action}]: {msg}", category="risk", level="ERROR", db=db, toast="error",
                  toast_key="toast.risk.event", toast_vars={"action": action, "msg": msg})

        if action == "alert":
            return False
        if action == "pause":
            self._pause.set()
            config_repo.update_bot_status(db, state=BOT_PAUSED, message=f"risk pause: {msg}")
            return False
        if action == "cancel":
            self._cancel_bot_orders(db)
            self._pause.set()
            config_repo.update_bot_status(db, state=BOT_PAUSED, message=f"risk cancel: {msg}")
            return False
        # stop / stop_close
        self._cancel_bot_orders(db)
        if action == "stop_close":
            self._close_all_positions()
        config_repo.update_bot_status(db, state=BOT_RISK_STOPPED, message=f"risk stop: {msg}")
        self._stop.set()
        return True

    def _refresh_quotes(self, db, cfg) -> None:
        """Maintain a two-sided post-only quote around the mid.

        Skips needless cancel/replace: if the market hasn't moved materially and
        our quotes are still fully on the book, leave them. A fill (which wakes
        the loop) drops a working order below the expected count and triggers a
        replenish; a price drift past half the spread triggers a full re-quote.
        """
        ticker = market_service.get_ticker(cfg.inst_id)
        mid = ticker.last_px
        if not mid:
            return

        # Don't quote on stale market data.
        delay = risk_service.market_delay_breach(db, ticker.ts)
        if delay:
            log_event(f"Quoting paused: {delay}", category="risk", level="WARN", db=db)
            audit_service.record_risk_event("market_delay", "pause", delay, level="WARNING", db=db)
            return
        spread = float(cfg.spread)
        size = float(cfg.order_size)
        td_mode = "cross" if cfg.inst_id.endswith("SWAP") else "cash"
        expected = int(cfg.num_levels) * 2

        working = [
            o for o in order_repo.list_orders(db, open_only=True)
            if o.source == "bot" and o.order_id and o.inst_id == cfg.inst_id
        ]
        moved = (
            self._last_quote_mid is None
            or abs(mid - self._last_quote_mid) >= self._last_quote_mid * spread * 0.5
        )
        # Quotes intact + market quiet → nothing to do (avoid churn).
        if len(working) >= expected and not moved:
            return

        # Otherwise rebuild the quote: drop existing bot orders, place fresh ones.
        self._cancel_bot_orders(db)
        placed = 0
        for level in range(1, int(cfg.num_levels) + 1):
            offset = spread * level
            bid_px = round(mid * (1 - offset), 2)
            ask_px = round(mid * (1 + offset), 2)
            for side, px in (("buy", bid_px), ("sell", ask_px)):
                # Hard pre-trade risk check — never quote past a limit.
                breach = risk_service.pre_order_breach(db, cfg.inst_id, side, size, px)
                if breach:
                    log_event(f"Quote skipped: {breach}", category="risk", level="WARN", db=db)
                    continue
                try:
                    order_service.place_order(
                        db,
                        PlaceOrderRequest(
                            inst_id=cfg.inst_id,
                            side=side,
                            ord_type="post_only",  # true maker: OKX rejects if it would cross
                            size=size,
                            price=px,
                            td_mode=td_mode,
                        ),
                        source="bot",
                    )
                    placed += 1
                except OkxError as exc:
                    log_event(f"Quote rejected: {exc.msg}", category="order", level="WARN", db=db)
        if placed:
            self._last_quote_mid = mid

    def _cancel_bot_orders(self, db=None) -> None:
        def _do(session):
            for order in order_repo.list_orders(session, open_only=True):
                if order.source != "bot" or not order.order_id:
                    continue
                try:
                    order_service.cancel_order(
                        session,
                        CancelOrderRequest(inst_id=order.inst_id, order_id=order.order_id),
                    )
                except Exception:
                    pass

        if db is not None:
            _do(db)
        else:
            with session_scope() as session:
                _do(session)

    def _cancel_all_orders(self) -> int:
        """Cancel every open order regardless of source. Returns count cancelled."""
        try:
            with session_scope() as session:
                return order_service.cancel_all(session)
        except Exception as exc:
            logger.error("emergency cancel-all failed: %s", exc)
            return 0

    def _close_all_positions(self) -> int:
        """Market-close all open positions. Returns count closed."""
        closed = 0
        try:
            with session_scope() as session:
                for p in position_service.get_positions(session):
                    mgn = "cross" if p.inst_id.endswith("SWAP") else "cash"
                    try:
                        position_service.close_position(p.inst_id, p.pos_side or "net", mgn)
                        closed += 1
                    except Exception as exc:
                        logger.error("close position %s failed: %s", p.inst_id, exc)
        except Exception as exc:
            logger.error("close-all failed: %s", exc)
        return closed


bot_manager = BotManager()
