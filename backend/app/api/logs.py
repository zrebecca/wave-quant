from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import log_repo
from app.schemas.log import LogOut

router = APIRouter()


@router.get("/logs", response_model=List[LogOut])
def list_logs(
    level: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    rows = log_repo.list_logs(db, level=level, category=category, search=search, limit=limit)
    return [LogOut.model_validate(r) for r in rows]
