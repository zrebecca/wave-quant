from datetime import datetime

from pydantic import BaseModel


class OperationAuditOut(BaseModel):
    id: int
    actor: str
    action: str
    target: str | None = None
    result: str
    before: str | None = None
    after: str | None = None
    detail: str | None = None
    trace_id: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
