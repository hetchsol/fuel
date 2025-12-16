
from fastapi import APIRouter
from . import auth, attachments, readings, sales, reports, discrepancies

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
router.include_router(readings.router, prefix="/nozzles", tags=["readings"])
router.include_router(sales.router, prefix="/sales", tags=["sales"])
router.include_router(reports.router, prefix="/reports", tags=["reports"])
router.include_router(discrepancies.router, prefix="/discrepancies", tags=["discrepancies"])
