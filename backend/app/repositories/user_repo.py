"""CRUD for users / members, plus bootstrap-admin seeding."""
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import hash_password
from app.core.config import settings
from app.models.user import ROLE_ADMIN, User


def get_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def get_by_username(db: Session, username: str) -> Optional[User]:
    return db.scalar(select(User).where(User.username == username))


def list_users(db: Session) -> List[User]:
    return list(db.scalars(select(User).order_by(User.id)))


def count_users(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User)) or 0


def create_user(db: Session, username: str, password: str, role: str) -> User:
    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(
    db: Session,
    user: User,
    *,
    password: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> User:
    if password is not None:
        user.password_hash = hash_password(password)
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()


def seed_default_admin(db: Session) -> None:
    """Create the bootstrap admin if there are no users yet."""
    if count_users(db) > 0:
        return
    create_user(
        db,
        username=settings.DEFAULT_ADMIN_USERNAME,
        password=settings.DEFAULT_ADMIN_PASSWORD,
        role=ROLE_ADMIN,
    )
