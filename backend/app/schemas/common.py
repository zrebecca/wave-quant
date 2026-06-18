"""Common response envelopes."""
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    msg: str = "ok"
    data: Optional[T] = None


class MessageResponse(BaseModel):
    code: int = 0
    msg: str = "ok"
