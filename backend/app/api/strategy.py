import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.repositories import config_repo
from app.schemas.strategy import (
    StopStrategyRequest,
    StrategyConfigOut,
    StrategyConfigUpdate,
    StrategyCreate,
    StrategyVersionOut,
)
from app.services import audit_service
from app.services.bot_manager import bot_manager
from app.services.log_service import log_event

router = APIRouter()


def _owned_strategy(db: Session, name: str, user: User):
    """Fetch a strategy instance the user owns, or 404 — keeps one account from
    reading/operating on another account's instance even by guessing its name."""
    cfg = config_repo.get_strategy_by_name(db, name)
    if cfg is None or cfg.owner_id != user.id:
        raise HTTPException(status_code=404, detail="策略不存在")
    return cfg


# ---- Strategy instances (CRUD over named configs) -------------------------
@router.get("/strategy/instances", response_model=List[StrategyConfigOut])
def list_instances(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    # Scope to the caller's own instances: each account only sees what it created.
    return [
        StrategyConfigOut.model_validate(c)
        for c in config_repo.list_strategies(db, owner_id=current.id)
    ]


@router.post("/strategy/instances", response_model=StrategyConfigOut)
def create_instance(
    payload: StrategyCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Name is globally unique (DB constraint); check across all instances.
    if config_repo.get_strategy_by_name(db, payload.name) is not None:
        raise HTTPException(status_code=409, detail="同名策略已存在")
    fields = payload.model_dump(exclude_unset=True, exclude={"note", "name"})
    cfg = config_repo.create_strategy(db, payload.name, fields, owner_id=admin.id)
    config_repo.create_strategy_version(db, cfg, note=payload.note or "created", created_by=admin.username)
    log_event(f"Strategy instance created: {payload.name}", category="strategy", db=db, toast="success",
              toast_key="toast.strat.created", toast_vars={"name": payload.name})
    audit_service.record_audit(admin.username, "strategy.create", target=payload.name, db=db)
    return StrategyConfigOut.model_validate(cfg)


@router.put("/strategy/instances/{name}", response_model=StrategyConfigOut)
def update_instance(
    name: str,
    payload: StrategyConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _owned_strategy(db, name, admin)
    fields = payload.model_dump(exclude_unset=True, exclude={"note"})
    cfg = config_repo.update_strategy(db, fields, name=name)
    ver = config_repo.create_strategy_version(db, cfg, note=payload.note, created_by=admin.username)
    log_event(f"Strategy instance updated: {name} (v{ver.version})", category="strategy", db=db, toast="success",
              toast_key="toast.strat.updated", toast_vars={"name": name, "version": ver.version})
    audit_service.record_audit(admin.username, "strategy.update", target=name, db=db)
    # If the running bot is on this instance, re-pin to the new params live.
    if bot_manager.is_running and bot_manager._active_name == name:
        bot_manager.apply_strategy()
    return StrategyConfigOut.model_validate(cfg)


@router.delete("/strategy/instances/{name}")
def delete_instance(
    name: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _owned_strategy(db, name, admin)
    if bot_manager.is_running and bot_manager._active_name == name:
        raise HTTPException(status_code=400, detail="策略运行中,请先停止再删除")
    # `default` is allowed to be deleted; it auto-recreates on next bot use
    # (get_or_create_strategy). Only the strategy config row is removed —
    # related orders / trades are left untouched.
    config_repo.delete_strategy(db, name)
    log_event(f"Strategy instance deleted: {name}", category="strategy", db=db, toast="warning",
              toast_key="toast.strat.deleted", toast_vars={"name": name})
    audit_service.record_audit(admin.username, "strategy.delete", target=name, db=db)
    return {"ok": True}


@router.post("/strategy/instances/{name}/run")
def run_instance(
    name: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _owned_strategy(db, name, admin)
    state = bot_manager.run_instance(name)
    return {"state": state, "strategy": name}


@router.post("/strategy/instances/{name}/stop")
def stop_instance(
    name: str,
    req: StopStrategyRequest = StopStrategyRequest(),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    _owned_strategy(db, name, admin)
    # 停止并卖出 → cancel_close (撤单 + 市价平仓); 停止但不卖出 → cancel (撤单留仓)
    return {"state": bot_manager.stop(mode=req.mode, reason=f"stop strategy {name}")}


def _version_out(ver) -> StrategyVersionOut:
    return StrategyVersionOut(
        id=ver.id,
        strategy_name=ver.strategy_name,
        version=ver.version,
        params=json.loads(ver.params),
        note=ver.note,
        created_by=ver.created_by,
        created_at=ver.created_at,
    )


@router.get("/strategy", response_model=StrategyConfigOut)
def get_strategy(db: Session = Depends(get_db)):
    return StrategyConfigOut.model_validate(config_repo.get_or_create_strategy(db))


@router.put("/strategy", response_model=StrategyConfigOut)
def update_strategy(
    payload: StrategyConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    before = StrategyConfigOut.model_validate(config_repo.get_or_create_strategy(db)).model_dump()
    fields = payload.model_dump(exclude_unset=True, exclude={"note"})
    cfg = config_repo.update_strategy(db, fields)
    after = StrategyConfigOut.model_validate(cfg).model_dump()
    # Snapshot a new immutable version of the resulting parameter set.
    ver = config_repo.create_strategy_version(db, cfg, note=payload.note, created_by=admin.username)
    log_event(
        f"Strategy updated (v{ver.version})",
        category="strategy",
        detail=fields,
        db=db,
        toast="success",
        toast_key="toast.strat.cfgUpdated",
        toast_vars={"version": ver.version},
    )
    audit_service.record_audit(
        admin.username, "strategy.update", target=f"v{ver.version}", before=before, after=after, db=db
    )
    return StrategyConfigOut.model_validate(cfg)


@router.get("/strategy/versions", response_model=List[StrategyVersionOut])
def list_versions(db: Session = Depends(get_db)):
    return [_version_out(v) for v in config_repo.list_strategy_versions(db)]


@router.post("/strategy/rollback/{version}", response_model=StrategyConfigOut)
def rollback(
    version: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ver = config_repo.get_strategy_version(db, version)
    if ver is None:
        raise HTTPException(status_code=404, detail="Version not found")
    before = StrategyConfigOut.model_validate(config_repo.get_or_create_strategy(db)).model_dump()
    params = json.loads(ver.params)
    cfg = config_repo.update_strategy(db, params)
    after = StrategyConfigOut.model_validate(cfg).model_dump()
    # Record the rollback itself as a new version for a complete history.
    new_ver = config_repo.create_strategy_version(
        db, cfg, note=f"rollback to v{version}", created_by=admin.username
    )
    log_event(f"Strategy rolled back to v{version} (now v{new_ver.version})", category="strategy", db=db, toast="warning",
              toast_key="toast.strat.rolledBack", toast_vars={"version": version, "newVersion": new_ver.version})
    audit_service.record_audit(
        admin.username, "strategy.rollback", target=f"v{version}", before=before, after=after, db=db
    )
    return StrategyConfigOut.model_validate(cfg)
