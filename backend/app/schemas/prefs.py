from typing import Literal, Optional

from pydantic import BaseModel

Theme = Literal["light", "dark"]
UpDown = Literal["green", "red"]
Fiat = Literal["USD", "CNY"]
Lang = Literal["en", "zh", "zh-TW"]


class PrefsOut(BaseModel):
    theme: Theme = "dark"
    up_down: UpDown = "green"
    fiat: Fiat = "USD"
    lang: Lang = "en"
    coin_icons: bool = False
    # False when the user has no saved row yet (the client should then migrate its
    # current local settings up to the server instead of overwriting them).
    stored: bool = False


class PrefsUpdate(BaseModel):
    """Partial update — only the provided fields are written."""
    theme: Optional[Theme] = None
    up_down: Optional[UpDown] = None
    fiat: Optional[Fiat] = None
    lang: Optional[Lang] = None
    coin_icons: Optional[bool] = None
