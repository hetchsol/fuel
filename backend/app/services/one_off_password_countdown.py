"""
ONE-OFF (November 2026) - delete this file and its call in main.py once it has run.

Starts the first staff password change countdown automatically, so no one
has to press the owner's button: every attendant, supervisor and manager
must change their password by the end of Monday 30/11/2026 (forced from
01/12/2026 00:00 Zambia time). After this, each person's 90-day rotation
runs on its own, and the owner's "Require all staff to change their
password" button covers any future countdown.

Runs at startup only while no countdown has ever been recorded and the
deadline has not passed, so restarts never repeat it. If it cannot start
(e.g. during a deploy the old instance still locks the users table), it
retries in the background every minute for up to an hour.
"""
import logging
import threading
import time

from . import password_policy as pwp

logger = logging.getLogger(__name__)

DEADLINE = "2026-11-30T22:00:00+00:00"   # 01/12/2026 00:00 CAT
RETRY_EVERY_S = 60
RETRY_FOR_S = 60 * 60


def run_once() -> str:
    """'started', 'not_needed' (already running or too late) or 'failed'."""
    try:
        if pwp.load_campaign().get("started_at"):
            return "not_needed"
        if pwp.utcnow() >= pwp._parse(DEADLINE):
            logger.info("[password] one-off countdown skipped: deadline already passed")
            return "not_needed"
        from ..api.v1.auth import launch_password_campaign, DEFAULT_STATION_ID
        launch_password_campaign(DEADLINE, "system", DEFAULT_STATION_ID, by_system=True)
        logger.info("[password] one-off staff password countdown started (deadline 30/11/2026)")
        return "started"
    except Exception as e:
        logger.error(f"[password] one-off countdown failed, will retry: {getattr(e, 'detail', e)}")
        return "failed"


def _retry_loop():
    deadline = time.monotonic() + RETRY_FOR_S
    while time.monotonic() < deadline:
        time.sleep(RETRY_EVERY_S)
        if run_once() != "failed":
            return
    logger.error("[password] one-off countdown gave up after an hour; restart the service to try again")


def start() -> str:
    """Called at startup: try now, and keep trying in the background if it fails."""
    result = run_once()
    if result == "failed":
        threading.Thread(target=_retry_loop, name="password-countdown-retry", daemon=True).start()
    return result
