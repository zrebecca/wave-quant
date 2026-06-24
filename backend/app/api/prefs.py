"""Per-user display preferences (设置) — stored server-side so theme / 涨跌色 /
价格单位 / 语言 / 币种图标 follow the account across browsers/ports/devices instead
of living in the browser's localStorage."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.repositories import prefs_repo
from app.schemas.prefs import PrefsOut, PrefsUpdate

router = APIRouter()


def _to_out(row) -> PrefsOut:
    if row is None:
        return PrefsOut(stored=False)
    return PrefsOut(
        theme=row.theme,
        up_down=row.up_down,
        fiat=row.fiat,
        lang=row.lang,
        coin_icons=row.coin_icons,
        stored=True,
    )


@router.get("/me/prefs", response_model=PrefsOut)
def get_my_prefs(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    return _to_out(prefs_repo.get_prefs(db, current.id))


@router.put("/me/prefs", response_model=PrefsOut)
def update_my_prefs(
    payload: PrefsUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = prefs_repo.set_prefs(db, current.id, **payload.model_dump(exclude_unset=True))
    return _to_out(row)
