
from pydantic import BaseModel
from typing import Optional, List

class ReadingIn(BaseModel):
    kind: str  # Opening|Closing|PreSale|PostSale
    manual_value: float
    attachment_id: Optional[str] = None
    ocr_conf_min: float = 0.85

class ReadingOut(BaseModel):
    status: str
    discrepancy: float
    reasons: List[str]
    reading_id: str

class SaleIn(BaseModel):
    shift_id: str
    nozzle_id: str
    pre_reading: float
    post_reading: float
    volume_dispensed: float
    cash_received: float
