from datetime import datetime

from pydantic import BaseModel


class LogOut(BaseModel):
    id: int
    level: str
    category: str
    message: str
    detail: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
