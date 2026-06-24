from typing import List

from pydantic import BaseModel, Field


class WatchlistOut(BaseModel):
    favorites: List[str] = Field(default_factory=list)
    pinned: List[str] = Field(default_factory=list)


class WatchlistUpdate(BaseModel):
    favorites: List[str] = Field(default_factory=list)
    pinned: List[str] = Field(default_factory=list)
