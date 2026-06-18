"""Operation audit trail (admin-only)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.audit import OperationAuditOut
from app.services import audit_service

router = APIRouter()


@router.get("/audits", response_model=List[OperationAuditOut])
def list_audits(
    limit: int = Query(200, ge=1, le=1000),
    action: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return [
        OperationAuditOut.model_validate(a)
        for a in audit_service.list_audits(db, limit=limit, action=action)
    ]
