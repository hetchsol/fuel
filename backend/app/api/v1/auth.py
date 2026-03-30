"""
Authentication API with Role-Based Access Control

Dual-mode:
  - DATABASE_URL set   → PostgreSQL-backed users + sessions (bcrypt, secure tokens, 24h expiry)
  - DATABASE_URL unset → in-memory fallback (local dev, unchanged behavior)
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from ...models.models import UserLogin, User, UserRole
from ...database.storage import get_station_storage
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...database.db import DATABASE_URL, is_db_active
import hashlib
import secrets
import string
import logging
import os
from typing import Optional
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

DEFAULT_STATION_ID = os.getenv("DEFAULT_STATION_ID", "ST001")

router = APIRouter()


def _USE_DB():
    """Check if DB is available — evaluated at call time, not import time."""
    return is_db_active()

# ──────────────────────────────────────────────────────────
# Password hashing helpers
# ──────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    """Hash a password. Uses bcrypt in DB mode, SHA-256 in fallback."""
    if _USE_DB():
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    return hashlib.sha256(password.encode()).hexdigest()


def _verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    if _USE_DB():
        import bcrypt
        try:
            return bcrypt.checkpw(password.encode(), hashed.encode())
        except Exception:
            return False
    return hashlib.sha256(password.encode()).hexdigest() == hashed


def _generate_token() -> str:
    """Generate a secure session token."""
    if _USE_DB():
        return secrets.token_hex(32)
    return None  # fallback builds token differently


# ──────────────────────────────────────────────────────────
# In-memory fallback (local dev, no DATABASE_URL)
# ──────────────────────────────────────────────────────────

users_db = {
    "owner1": {
        "user_id": "O001",
        "username": "owner1",
        "password": hashlib.sha256("owner123".encode()).hexdigest(),
        "full_name": "Business Owner",
        "role": UserRole.OWNER,
        "station_id": None,
        "is_active": True,
    },
}

# In-memory session storage (fallback only)
active_sessions = {}


# ──────────────────────────────────────────────────────────
# Authentication Dependencies (unchanged signatures)
# ──────────────────────────────────────────────────────────

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and validate user from session token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]

    if _USE_DB():
        from ...database.db import db_get_session, db_get_user_by_username
        session = db_get_session(token)
        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session token")
        user = db_get_user_by_username(session["username"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is disabled. Contact the owner.")
        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "station_id": user.get("station_id"),
            "is_active": user.get("is_active", True),
        }
    else:
        # Fallback: in-memory sessions
        if token not in active_sessions:
            if token.startswith("token-"):
                parts = token.split("-", 2)
                if len(parts) >= 3:
                    recovered_username = parts[1]
                    recovered_user_id = parts[2]
                    if recovered_username in users_db and users_db[recovered_username]["user_id"] == recovered_user_id:
                        active_sessions[token] = {
                            "user_id": recovered_user_id,
                            "username": recovered_username,
                            "role": users_db[recovered_username]["role"],
                        }
            if token not in active_sessions:
                raise HTTPException(status_code=401, detail="Invalid or expired session token")

        session = active_sessions[token]
        username = session["username"]
        if username not in users_db:
            raise HTTPException(status_code=401, detail="User not found")
        user_data = users_db[username]
        if not user_data.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is disabled. Contact the owner.")
        return {
            "user_id": user_data["user_id"],
            "username": username,
            "full_name": user_data["full_name"],
            "role": user_data["role"],
            "station_id": user_data.get("station_id"),
            "is_active": user_data.get("is_active", True),
        }


async def require_supervisor_or_owner(current_user: dict = Depends(get_current_user)):
    """Restrict access to supervisors and owners only."""
    role = current_user["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors and owners only."
        )
    return current_user


async def require_owner(current_user: dict = Depends(get_current_user)):
    """Restrict access to owners only."""
    role = current_user["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str != UserRole.OWNER.value:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to owners only."
        )
    return current_user


async def get_station_context(
    current_user: dict = Depends(get_current_user),
    x_station_id: Optional[str] = Header(None)
) -> dict:
    """Resolve station from user token or X-Station-Id header."""
    station_id = current_user.get("station_id") or x_station_id or DEFAULT_STATION_ID
    if not current_user.get("station_id") and not x_station_id:
        logger.warning(f"[auth] Using fallback station_id={DEFAULT_STATION_ID} for user {current_user.get('username')}")
    storage = get_station_storage(station_id)
    return {**current_user, "station_id": station_id, "storage": storage}


# ──────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────

@router.post("/login")
def login(credentials: UserLogin):
    """Authenticate user and return role-based access token."""
    username = credentials.username
    password = credentials.password

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_create_session
        user = db_get_user_by_username(username)
        if not user or not _verify_password(password, user["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is disabled. Contact the owner.")

        token = _generate_token()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db_create_session(token, user["user_id"], username, user["role"], expires_at)

        # Check if setup wizard is needed (owner + setup not yet completed)
        needs_setup = False
        if user["role"] == "owner":
            station_id = user.get("station_id") or DEFAULT_STATION_ID
            storage = get_station_storage(station_id)
            sys_settings = storage.get("system_settings", {})
            needs_setup = not sys_settings.get("setup_completed", False)

        return {
            "access_token": token,
            "token_type": "bearer",
            "needs_setup": needs_setup,
            "user": {
                "user_id": user["user_id"],
                "username": username,
                "full_name": user["full_name"],
                "role": user["role"],
                "station_id": user.get("station_id"),
                "is_active": user.get("is_active", True),
            }
        }
    else:
        if username not in users_db:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        user_data = users_db[username]
        if not _verify_password(password, user_data["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        if not user_data.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is disabled. Contact the owner.")

        session_token = f"token-{username}-{user_data['user_id']}"
        active_sessions[session_token] = {
            "user_id": user_data["user_id"],
            "username": username,
            "role": user_data["role"],
        }

        # Check if setup wizard is needed (owner + setup not yet completed)
        needs_setup = False
        role_val = user_data.get("role")
        if hasattr(role_val, 'value'):
            role_val = role_val.value
        if role_val == "owner":
            station_id = user_data.get("station_id") or DEFAULT_STATION_ID
            storage = get_station_storage(station_id)
            sys_settings = storage.get("system_settings", {})
            needs_setup = not sys_settings.get("setup_completed", False)

        return {
            "access_token": session_token,
            "token_type": "bearer",
            "needs_setup": needs_setup,
            "user": {
                "user_id": user_data["user_id"],
                "username": username,
                "full_name": user_data["full_name"],
                "role": user_data["role"],
                "station_id": user_data.get("station_id"),
                "is_active": user_data.get("is_active", True),
            }
        }


@router.post("/logout")
def logout(token: str):
    """Logout user and invalidate session."""
    if _USE_DB():
        from ...database.db import db_delete_session
        db_delete_session(token)
    else:
        if token in active_sessions:
            del active_sessions[token]
    return {"message": "Logged out successfully"}


@router.get("/me")
def get_user_info(token: str):
    """Get current logged-in user info."""
    if _USE_DB():
        from ...database.db import db_get_session, db_get_user_by_username
        session = db_get_session(token)
        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        user = db_get_user_by_username(session["username"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "station_id": user.get("station_id"),
        }
    else:
        if token not in active_sessions:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        session = active_sessions[token]
        user_data = users_db[session["username"]]
        return {
            "user_id": user_data["user_id"],
            "username": user_data["username"],
            "full_name": user_data["full_name"],
            "role": user_data["role"],
            "station_id": user_data.get("station_id"),
        }


@router.get("/users", dependencies=[Depends(require_owner)])
def list_users():
    """List all users (Owner only)."""
    if _USE_DB():
        from ...database.db import db_get_all_users
        users = db_get_all_users()
        return [
            {
                "user_id": u["user_id"], "username": u["username"],
                "full_name": u["full_name"], "role": u["role"],
                "station_id": u.get("station_id"),
                "is_active": u.get("is_active", True),
            }
            for u in users
        ]
    else:
        return [
            {
                "user_id": user["user_id"], "username": user["username"],
                "full_name": user["full_name"], "role": user["role"],
                "station_id": user.get("station_id"),
                "is_active": user.get("is_active", True),
            }
            for user in users_db.values()
        ]


@router.post("/users")
def create_user(user_data: dict, current_user: dict = Depends(require_owner)):
    """Create a new user (Owner only)."""
    username = user_data.get("username")
    password = user_data.get("password")
    full_name = user_data.get("full_name")
    role = user_data.get("role", "user")
    station_id = user_data.get("station_id")

    if not username or not password or not full_name:
        raise HTTPException(status_code=400, detail="Username, password, and full_name are required")

    if _USE_DB():
        from ...database.db import (
            db_get_user_by_username, db_create_user, db_count_users_by_prefix,
        )
        if db_get_user_by_username(username):
            raise HTTPException(status_code=400, detail="Username already exists")

        count = db_count_users_by_prefix("STF") + 1
        user_id = f"STF{count:03d}"
        hashed = _hash_password(password)
        db_create_user(user_id, username, hashed, full_name, role,
                       station_id if role != "owner" else None)
    else:
        if username in users_db:
            raise HTTPException(status_code=400, detail="Username already exists")
        existing_ids = [u["user_id"] for u in users_db.values()]
        user_count = len([uid for uid in existing_ids if uid.startswith("STF")]) + 1
        user_id = f"STF{user_count:03d}"
        hashed = _hash_password(password)
        users_db[username] = {
            "user_id": user_id, "username": username, "password": hashed,
            "full_name": full_name, "role": role,
            "station_id": station_id if role != "owner" else None,
            "is_active": True,
        }

    log_audit_event(
        station_id=current_user.get("station_id") or "ST001",
        action="user_create",
        performed_by=current_user["username"],
        entity_type="user",
        entity_id=user_id,
        details={"username": username, "role": role},
    )
    create_notification(
        station_id=current_user.get("station_id") or "ST001",
        type="USER_CREATED",
        severity="high",
        title="New User Created",
        message=f"User '{full_name}' ({username}) created with role '{role}'",
        entity_type="user",
        entity_id=user_id,
        created_by=current_user["username"],
    )

    return {
        "message": "User created successfully",
        "user": {
            "user_id": user_id, "username": username, "full_name": full_name,
            "role": role, "station_id": station_id if role != "owner" else None,
            "is_active": True,
        }
    }


@router.put("/users/{username}")
def update_user(username: str, user_data: dict, current_user: dict = Depends(require_owner)):
    """Update an existing user (Owner only)."""
    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_update_user
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        changed = {}
        fields = {}
        if "full_name" in user_data:
            if user["full_name"] != user_data["full_name"]:
                changed["full_name"] = {"old": user["full_name"], "new": user_data["full_name"]}
            fields["full_name"] = user_data["full_name"]
        if "role" in user_data:
            if user["role"] != user_data["role"]:
                changed["role"] = {"old": user["role"], "new": user_data["role"]}
            fields["role"] = user_data["role"]
        if "station_id" in user_data:
            fields["station_id"] = user_data["station_id"] if user_data.get("role") != "owner" else None
        if "password" in user_data and user_data["password"]:
            changed["password"] = "changed"
            fields["password"] = _hash_password(user_data["password"])

        if fields:
            db_update_user(username, fields)

        # Re-read for response
        user = db_get_user_by_username(username)
        user_id = user["user_id"]
    else:
        if username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        user = users_db[username]
        changed = {}

        if "full_name" in user_data:
            if user["full_name"] != user_data["full_name"]:
                changed["full_name"] = {"old": user["full_name"], "new": user_data["full_name"]}
            user["full_name"] = user_data["full_name"]
        if "role" in user_data:
            old_role = user["role"].value if hasattr(user["role"], "value") else user["role"]
            if old_role != user_data["role"]:
                changed["role"] = {"old": old_role, "new": user_data["role"]}
            user["role"] = user_data["role"]
        if "station_id" in user_data:
            user["station_id"] = user_data["station_id"] if user_data.get("role") != "owner" else None
        if "password" in user_data and user_data["password"]:
            changed["password"] = "changed"
            user["password"] = _hash_password(user_data["password"])
        user_id = user["user_id"]

    log_audit_event(
        station_id=current_user.get("station_id") or "ST001",
        action="user_update",
        performed_by=current_user["username"],
        entity_type="user",
        entity_id=user_id,
        details={"username": username, "changed": changed},
    )
    if "role" in changed:
        create_notification(
            station_id=current_user.get("station_id") or "ST001",
            type="USER_ROLE_CHANGE",
            severity="high",
            title="User Role Changed",
            message=f"User '{username}' role changed from '{changed['role']['old']}' to '{changed['role']['new']}'",
            entity_type="user",
            entity_id=user_id,
            created_by=current_user["username"],
        )

    return {
        "message": "User updated successfully",
        "user": {
            "user_id": user["user_id"], "username": username,
            "full_name": user["full_name"], "role": user["role"],
            "station_id": user.get("station_id"),
            "is_active": user.get("is_active", True),
        }
    }


@router.delete("/users/{username}")
def delete_user(username: str, current_user: dict = Depends(require_owner)):
    """Delete a user (Owner only, cannot delete owner)."""
    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_delete_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Cannot delete owner account")

        deleted_user_id = user["user_id"]
        db_delete_user_sessions(username)
        db_delete_user(username)
    else:
        if username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        user = users_db[username]
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Cannot delete owner account")
        deleted_user_id = user["user_id"]

        sessions_to_remove = [t for t, s in active_sessions.items() if s["username"] == username]
        for t in sessions_to_remove:
            del active_sessions[t]
        del users_db[username]

    log_audit_event(
        station_id=current_user.get("station_id") or "ST001",
        action="user_delete",
        performed_by=current_user["username"],
        entity_type="user",
        entity_id=deleted_user_id,
        details={"username": username},
    )
    create_notification(
        station_id=current_user.get("station_id") or "ST001",
        type="USER_DELETED",
        severity="high",
        title="User Deleted",
        message=f"User '{username}' has been deleted",
        entity_type="user",
        entity_id=deleted_user_id,
        created_by=current_user["username"],
    )

    return {"message": f"User {username} deleted successfully"}


@router.get("/staff", dependencies=[Depends(get_current_user)])
def list_staff():
    """Get list of staff members for shift assignment."""
    if _USE_DB():
        from ...database.db import db_get_all_users
        users = db_get_all_users()
        return [
            {
                "user_id": u["user_id"], "username": u["username"],
                "full_name": u["full_name"], "role": u["role"],
                "station_id": u.get("station_id"),
                "is_active": u.get("is_active", True),
            }
            for u in users if u["role"] in ["user", "supervisor"] and u.get("is_active", True)
        ]
    else:
        return [
            {
                "user_id": user["user_id"], "username": user["username"],
                "full_name": user["full_name"], "role": user["role"],
                "station_id": user.get("station_id"),
                "is_active": user.get("is_active", True),
            }
            for user in users_db.values()
            if user["role"] in ["user", "supervisor"] and user.get("is_active", True)
        ]


@router.patch("/users/{username}/toggle-status")
def toggle_user_status(username: str, current_user: dict = Depends(require_owner)):
    """Enable or disable a user account (Owner only). Cannot disable owner accounts."""
    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_update_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Cannot disable owner accounts")

        new_status = not user.get("is_active", True)
        db_update_user(username, {"is_active": new_status})

        # Invalidate all sessions when disabling
        if not new_status:
            db_delete_user_sessions(username)

        user = db_get_user_by_username(username)
    else:
        if username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        user = users_db[username]
        role_val = user["role"].value if hasattr(user["role"], "value") else user["role"]
        if role_val == "owner":
            raise HTTPException(status_code=403, detail="Cannot disable owner accounts")

        new_status = not user.get("is_active", True)
        user["is_active"] = new_status

        # Invalidate all sessions when disabling
        if not new_status:
            sessions_to_remove = [t for t, s in active_sessions.items() if s["username"] == username]
            for t in sessions_to_remove:
                del active_sessions[t]

    action = "user_enable" if new_status else "user_disable"
    status_label = "enabled" if new_status else "disabled"

    log_audit_event(
        station_id=current_user.get("station_id") or "ST001",
        action=action,
        performed_by=current_user["username"],
        entity_type="user",
        entity_id=user.get("user_id", ""),
        details={"username": username, "is_active": new_status},
    )
    create_notification(
        station_id=current_user.get("station_id") or "ST001",
        type="USER_STATUS_CHANGE",
        severity="high",
        title=f"User Account {status_label.title()}",
        message=f"User '{username}' has been {status_label}",
        entity_type="user",
        entity_id=user.get("user_id", ""),
        created_by=current_user["username"],
    )

    return {
        "message": f"User {username} {status_label} successfully",
        "user": {
            "user_id": user["user_id"], "username": user.get("username", username),
            "full_name": user["full_name"], "role": user["role"],
            "station_id": user.get("station_id"),
            "is_active": user.get("is_active", new_status),
        }
    }


@router.post("/users/{username}/reset-password")
def reset_user_password(username: str, current_user: dict = Depends(require_owner)):
    """Reset a user's password to a random 12-character string (Owner only)."""
    # Generate random 12-char password
    alphabet = string.ascii_letters + string.digits
    new_password = ''.join(secrets.choice(alphabet) for _ in range(12))
    hashed = _hash_password(new_password)

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_update_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        db_update_user(username, {"password": hashed})
        # Invalidate existing sessions so user must re-login
        db_delete_user_sessions(username)
        user_id = user["user_id"]
    else:
        if username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        users_db[username]["password"] = hashed
        user_id = users_db[username]["user_id"]

        # Invalidate existing sessions
        sessions_to_remove = [t for t, s in active_sessions.items() if s["username"] == username]
        for t in sessions_to_remove:
            del active_sessions[t]

    log_audit_event(
        station_id=current_user.get("station_id") or "ST001",
        action="user_password_reset",
        performed_by=current_user["username"],
        entity_type="user",
        entity_id=user_id,
        details={"username": username},
    )
    create_notification(
        station_id=current_user.get("station_id") or "ST001",
        type="USER_PASSWORD_RESET",
        severity="high",
        title="User Password Reset",
        message=f"Password for user '{username}' has been reset by {current_user['username']}",
        entity_type="user",
        entity_id=user_id,
        created_by=current_user["username"],
    )

    return {
        "message": f"Password for {username} has been reset",
        "new_password": new_password,
    }
