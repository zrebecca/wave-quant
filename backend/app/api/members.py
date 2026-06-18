"""Member management — admin-only CRUD over application users."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import VALID_ROLES, User
from app.repositories import user_repo
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.schemas.common import MessageResponse
from app.services.log_service import log_event

router = APIRouter()


@router.get("/members", response_model=List[UserOut])
def list_members(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [UserOut.model_validate(u) for u in user_repo.list_users(db)]


@router.post("/members", response_model=UserOut, status_code=201)
def create_member(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {VALID_ROLES}")
    if user_repo.get_by_username(db, payload.username):
        raise HTTPException(status_code=409, detail="Username already exists")
    user = user_repo.create_user(db, payload.username, payload.password, payload.role)
    log_event(
        f"Member created: {user.username} ({user.role})",
        category="admin",
        db=db,
        toast="success",
        toast_key="toast.member.created",
        toast_vars={"name": user.username, "role": user.role},
    )
    return UserOut.model_validate(user)


@router.put("/members/{user_id}", response_model=UserOut)
def update_member(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = user_repo.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if payload.role is not None and payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {VALID_ROLES}")
    # Guard: don't let an admin demote or disable their own account and lock themselves out.
    if user.id == admin.id:
        if payload.role is not None and payload.role != user.role:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        if payload.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user = user_repo.update_user(
        db,
        user,
        password=payload.password,
        role=payload.role,
        is_active=payload.is_active,
    )
    log_event(f"Member updated: {user.username}", category="admin", db=db, toast="success",
              toast_key="toast.member.updated", toast_vars={"name": user.username})
    return UserOut.model_validate(user)


@router.delete("/members/{user_id}", response_model=MessageResponse)
def delete_member(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = user_repo.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    username = user.username
    user_repo.delete_user(db, user)
    log_event(f"Member deleted: {username}", category="admin", db=db, toast="info",
              toast_key="toast.member.deleted", toast_vars={"name": username})
    return MessageResponse(msg=f"deleted {username}")
