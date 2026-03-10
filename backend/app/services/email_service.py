"""
Email Notification Service via Resend
Sends email for every in-app notification to configured recipients.
Wrapped in try/except so failures never block the caller.
"""
import os
import json
from ..database.station_files import load_station_json


SEVERITY_COLORS = {
    "critical": "#DC2626",
    "high": "#EA580C",
    "medium": "#CA8A04",
    "low": "#2563EB",
    "info": "#6B7280",
}


def _load_email_settings(station_id: str) -> dict:
    """Load email settings from station-specific storage."""
    return load_station_json(station_id, "email_settings.json", default={})


def _build_html(notification: dict) -> str:
    """Build a simple HTML email body from a notification dict."""
    severity = notification.get("severity", "info")
    color = SEVERITY_COLORS.get(severity, "#6B7280")
    title = notification.get("title", "Notification")
    message = notification.get("message", "")
    entity_type = notification.get("entity_type", "")
    entity_id = notification.get("entity_id", "")
    timestamp = notification.get("timestamp", "")

    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: {color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">[{severity.upper()}] {title}</h2>
      </div>
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">{message}</p>
        <table style="font-size: 13px; color: #6B7280;">
          <tr><td style="padding-right: 12px; font-weight: 600;">Entity:</td><td>{entity_type}</td></tr>
          <tr><td style="padding-right: 12px; font-weight: 600;">ID:</td><td>{entity_id}</td></tr>
          <tr><td style="padding-right: 12px; font-weight: 600;">Time:</td><td>{timestamp}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 16px 0;" />
        <p style="color: #9CA3AF; font-size: 12px; margin: 0;">This is an automated notification from NextStop Fuel Management.</p>
      </div>
    </div>
    """


def send_notification_email(station_id: str, notification: dict):
    """
    Send an email for a notification via Resend.
    Silently returns if email is not configured or disabled.
    Never raises — all exceptions are caught and logged.
    """
    try:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key or api_key == "re_your_api_key_here":
            return None

        settings = _load_email_settings(station_id)
        if not settings.get("enabled", False):
            return None

        recipients = settings.get("recipients", [])
        if not recipients:
            return None

        from_address = settings.get("from_address", "NextStop <onboarding@resend.dev>")
        severity = notification.get("severity", "info").upper()
        title = notification.get("title", "Notification")

        import resend
        resend.api_key = api_key

        resend.Emails.send({
            "from": from_address,
            "to": recipients,
            "subject": f"[{severity}] {title}",
            "html": _build_html(notification),
        })
    except Exception as exc:
        print(f"[email] WARNING: failed to send notification email: {exc}")
        return None


def send_test_email(station_id: str) -> dict:
    """
    Send a test email to verify configuration.
    Returns {"success": True/False, "message": "..."}.
    """
    try:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key or api_key == "re_your_api_key_here":
            return {"success": False, "message": "RESEND_API_KEY not configured on server"}

        settings = _load_email_settings(station_id)
        if not settings.get("enabled", False):
            return {"success": False, "message": "Email notifications are disabled"}

        recipients = settings.get("recipients", [])
        if not recipients:
            return {"success": False, "message": "No recipients configured"}

        from_address = settings.get("from_address", "NextStop <onboarding@resend.dev>")

        import resend
        resend.api_key = api_key

        test_notification = {
            "severity": "info",
            "title": "Test Notification",
            "message": "This is a test email from NextStop. If you received this, email notifications are working correctly!",
            "entity_type": "test",
            "entity_id": "test",
            "timestamp": __import__("datetime").datetime.now().isoformat(),
        }

        resend.Emails.send({
            "from": from_address,
            "to": recipients,
            "subject": "[TEST] NextStop Email Notification Test",
            "html": _build_html(test_notification),
        })

        return {"success": True, "message": f"Test email sent to {', '.join(recipients)}"}
    except Exception as exc:
        return {"success": False, "message": f"Failed to send test email: {exc}"}
