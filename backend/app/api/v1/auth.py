"""
Authentication API with Role-Based Access Control

Dual-mode:
  - DATABASE_URL set   → PostgreSQL-backed users + sessions (bcrypt, secure tokens, 24h expiry)
  - DATABASE_URL unset → in-memory fallback (local dev, unchanged behavior)
"""
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from ...models.models import UserLogin, User, UserRole
from ...database.storage import get_station_storage
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...services import password_policy as pwp
from ...database.db import DATABASE_URL, is_db_active
import hashlib
import secrets
import string
import logging
import os
import time
from typing import Optional
from collections import defaultdict
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

DEFAULT_STATION_ID = os.getenv("DEFAULT_STATION_ID", "ST001")

# ── Rate limiting ─────────────────────────────────────
_login_attempts: dict = defaultdict(list)
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(ip: str):
    """Block if more than 5 login attempts per minute from same IP."""
    if ip == "testclient" or os.getenv("TESTING") == "1":
        return  # Skip rate limiting in tests
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait 60 seconds.")
    _login_attempts[ip].append(now)

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

import json as _json

_USERS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'storage', 'users.json')


def _load_users_file() -> dict:
    try:
        with open(_USERS_FILE, 'r', encoding='utf-8') as f:
            return _json.load(f)
    except (FileNotFoundError, _json.JSONDecodeError):
        return {}


def _save_users_file():
    os.makedirs(os.path.dirname(_USERS_FILE), exist_ok=True)
    serialisable = {}
    for uname, u in users_db.items():
        row = dict(u)
        if hasattr(row.get('role'), 'value'):
            row['role'] = row['role'].value
        serialisable[uname] = row
    try:
        with open(_USERS_FILE, 'w', encoding='utf-8') as f:
            _json.dump(serialisable, f, indent=2)
    except Exception as e:
        logger.warning(f"[auth] Could not save users file: {e}")


def _get_user_record(username: str) -> Optional[dict]:
    """The stored user (with password hash and expiry fields), whichever mode is active."""
    if _USE_DB():
        from ...database.db import db_get_user_by_username
        return db_get_user_by_username(username)
    return users_db.get(username)


def _db_safe_fields(fields: dict) -> dict:
    """
    Drop the password-expiry fields if their columns cannot be added yet, so
    saving a password (or anything else) never fails because of this feature.
    """
    if not any(k in fields for k in ("password_change_due", "password_changed_at")):
        return fields
    from ...database.db import db_ensure_password_columns
    if db_ensure_password_columns():
        return fields
    logger.warning("[auth] password-expiry columns missing; saving without expiry fields")
    return {k: v for k, v in fields.items() if k not in ("password_change_due", "password_changed_at")}


def _set_user_fields(username: str, fields: dict):
    if not fields:
        return
    if _USE_DB():
        from ...database.db import db_update_user
        db_update_user(username, _db_safe_fields(fields))
    else:
        users_db[username].update(fields)
        _save_users_file()


def _all_user_records() -> list:
    if _USE_DB():
        from ...database.db import db_get_all_users
        return db_get_all_users()
    return list(users_db.values())


def _due_now_unless_owner(role) -> dict:
    """A password someone else set (new user, reset, edit) must be changed at first sign-in."""
    return {} if pwp.is_exempt(role) else {"password_change_due": pwp.due_now()}


def _check_password_expiry(user: dict, request: Optional[Request]):
    """From the due moment on, only changing the password (or signing out) is allowed."""
    if request is not None and pwp.must_change(user) and not pwp.path_is_exempt(request.url.path):
        raise HTTPException(status_code=403, detail=pwp.FORCED_DETAIL,
                            headers={pwp.FORCED_HEADER: "1"})


users_db = {
    "owner1": {
        "user_id": "O001",
        "username": "owner1",
        "password": hashlib.sha256("owner123".encode()).hexdigest(),
        "full_name": "",
        "role": UserRole.OWNER,
        "station_id": None,
        "is_active": True,
    },
}

# Overlay any previously saved users (persists name changes across restarts in file mode)
for _uname, _saved in _load_users_file().items():
    _role_raw = _saved.get('role', 'user')
    try:
        _role = UserRole(_role_raw)
    except ValueError:
        _role = _role_raw
    users_db[_uname] = {**_saved, 'role': _role}

# In-memory session storage (fallback only)
active_sessions = {}


# ──────────────────────────────────────────────────────────
# Authentication Dependencies (unchanged signatures)
# ──────────────────────────────────────────────────────────

async def get_current_user(request: Request, authorization: Optional[str] = Header(None)):
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
        _check_password_expiry(user, request)
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
        _check_password_expiry(user_data, request)
        return {
            "user_id": user_data["user_id"],
            "username": username,
            "full_name": user_data["full_name"],
            "role": user_data["role"],
            "station_id": user_data.get("station_id"),
            "is_active": user_data.get("is_active", True),
        }


async def require_supervisor_or_owner(current_user: dict = Depends(get_current_user)):
    """Restrict access to supervisors, managers, and owners."""
    role = current_user["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors, managers, and owners."
        )
    return current_user


async def require_manager_or_owner(current_user: dict = Depends(get_current_user)):
    """Restrict access to managers and owners only."""
    role = current_user["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to managers and owners only."
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
    """
    Resolve station from user token or X-Station-Id header.

    A user with their own station_id set has it win outright by default —
    the header is otherwise ignored, so a manager/supervisor/attendant can
    never be pointed at someone else's station just by sending a header.
    The one deliberate exception: a manager may additionally reach a
    station explicitly flagged is_test_station (toggled via
    PATCH /stations/{id}/toggle-test-flag, owner only) — never any other
    station. Owners remain unrestricted, as before.
    """
    own_station_id = current_user.get("station_id")
    role = current_user.get("role")
    role_str = role.value if hasattr(role, "value") else str(role)

    if own_station_id and role_str == "manager" and x_station_id and x_station_id != own_station_id:
        from ...database.stations_registry import get_station as _get_station
        target = _get_station(x_station_id)
        if target and target.get("is_test_station") and target.get("status", "active") != "disabled":
            station_id = x_station_id
        else:
            station_id = own_station_id
    else:
        station_id = own_station_id or x_station_id or DEFAULT_STATION_ID

    if not own_station_id and not x_station_id:
        logger.warning(f"[auth] Using fallback station_id={DEFAULT_STATION_ID} for user {current_user.get('username')}")
    storage = get_station_storage(station_id)
    return {**current_user, "station_id": station_id, "storage": storage}


# ──────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────

def _device_station(request: Request, user: dict) -> str:
    return request.headers.get("x-station-id") or user.get("station_id") or DEFAULT_STATION_ID


def _login_extras(user: dict, request: Request) -> dict:
    """Password status and shared-device flag returned with every sign-in."""
    shared = False
    try:
        shared = pwp.record_login(_device_station(request, user), request.headers.get("x-device-id"),
                                  user["username"], request.headers.get("user-agent", ""))
    except Exception as e:
        logger.warning(f"[auth] could not record device for {user.get('username')}: {e}")
    return {"password_status": pwp.status(user), "device_shared": shared}


@router.post("/login")
def login(credentials: UserLogin, request: Request):
    """Authenticate user and return role-based access token."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

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
        # Reload from DB to pick up any external changes (e.g. bare metal wipe)
        needs_setup = False
        if user["role"] == "owner":
            station_id = user.get("station_id") or DEFAULT_STATION_ID
            from ...database.storage import reload_station_from_db
            storage = reload_station_from_db(station_id)
            sys_settings = storage.get("system_settings", {})
            needs_setup = not sys_settings.get("setup_completed", False)

        return {
            "access_token": token,
            "token_type": "bearer",
            "needs_setup": needs_setup,
            **_login_extras(user, request),
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
        # Reload from DB to pick up any external changes (e.g. bare metal wipe)
        needs_setup = False
        role_val = user_data.get("role")
        if hasattr(role_val, 'value'):
            role_val = role_val.value
        if role_val == "owner":
            station_id = user_data.get("station_id") or DEFAULT_STATION_ID
            from ...database.storage import reload_station_from_db
            storage = reload_station_from_db(station_id)
            sys_settings = storage.get("system_settings", {})
            needs_setup = not sys_settings.get("setup_completed", False)

        return {
            "access_token": session_token,
            "token_type": "bearer",
            "needs_setup": needs_setup,
            **_login_extras(user_data, request),
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


@router.post("/refresh")
def refresh_token(current_user: dict = Depends(get_current_user)):
    """Issue a new session token, extending the session by 24 hours."""
    username = current_user["username"]

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_create_session
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        token = _generate_token()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db_create_session(token, user["user_id"], username, user["role"], expires_at)

        return {"access_token": token, "token_type": "bearer"}
    else:
        user_data = users_db.get(username)
        if not user_data:
            raise HTTPException(status_code=401, detail="User not found")
        session_token = f"token-{username}-{user_data['user_id']}"
        active_sessions[session_token] = {
            "user_id": user_data["user_id"],
            "username": username,
            "role": user_data["role"],
        }
        return {"access_token": session_token, "token_type": "bearer"}


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


@router.get("/users", dependencies=[Depends(require_manager_or_owner)])
def list_users(ctx: dict = Depends(get_station_context)):
    """
    List enrolled users for the CURRENT station context (with their roles).

    Strict per-station scoping — avoids cross-station overlap where a user
    appears in another station's view:
      - Returns only users whose station_id matches the current station context
        (the X-Station-Id header / DEFAULT_STATION_ID). Owner accounts
        (station_id = None) are cross-station and are not shown here.
      - Managers additionally see only attendants and supervisors.
    """
    caller_role = ctx.get("role", "")
    if hasattr(caller_role, 'value'):
        caller_role = caller_role.value
    is_manager = caller_role == "manager"
    visible_roles = ["user", "supervisor"] if is_manager else None
    station_id = ctx.get("station_id")

    def visible(u: dict) -> bool:
        u_station = u.get("station_id") or None
        # Owner accounts have no station_id; show them only to other owners
        if u_station is None:
            return caller_role == "owner" and u.get("role") == "owner"
        if u_station != station_id:
            return False
        if visible_roles and u.get("role") not in visible_roles:
            return False
        return True

    if _USE_DB():
        from ...database.db import db_get_all_users
        users = db_get_all_users()
    else:
        users = list(users_db.values())

    return [
        {
            "user_id": u["user_id"], "username": u["username"],
            "full_name": u["full_name"], "role": u["role"],
            "station_id": u.get("station_id"),
            "is_active": u.get("is_active", True),
            "password_status": pwp.status(u),
        }
        for u in users if visible(u)
    ]


def _validate_station_id(station_id):
    """
    Reject a station_id that doesn't exist (or is disabled). No-op for empty
    values (owner accounts intentionally have no station). Belt-and-suspenders
    next to the frontend station dropdown — the UI can't be the only guard.
    """
    if not station_id:
        return
    from ...database import stations_registry
    station = stations_registry.STATIONS.get(station_id)
    if not station:
        raise HTTPException(status_code=400, detail=f"Unknown station '{station_id}'.")
    if station.get("status", "active") == "disabled":
        raise HTTPException(status_code=400, detail=f"Station '{station_id}' is disabled.")


def _next_staff_id() -> str:
    """
    Next STFNNN id based on the MAX existing number, not a count.

    Using a count breaks after any deletion: e.g. with STF001/STF002/STF004 the
    count is 3, so count+1 regenerates STF004 — an existing id — and the INSERT
    fails with a duplicate-primary-key error (surfaced as a 500). Taking max+1
    (and skipping any taken id) keeps generated ids unique regardless of history.
    """
    existing = set()
    if _USE_DB():
        try:
            from ...database.db import db_get_all_users
            existing = {u.get("user_id") for u in db_get_all_users()}
        except Exception:
            existing = set()
    else:
        existing = {u.get("user_id") for u in users_db.values()}

    max_n = 0
    for uid in existing:
        if uid and uid.startswith("STF"):
            try:
                max_n = max(max_n, int(uid[3:]))
            except ValueError:
                pass
    n = max_n + 1
    while f"STF{n:03d}" in existing:
        n += 1
    return f"STF{n:03d}"


@router.post("/users")
def create_user(user_data: dict, current_user: dict = Depends(require_manager_or_owner)):
    """Create a new user (Manager/Owner). Managers can only create attendants and supervisors."""
    username = user_data.get("username")
    password = user_data.get("password")
    full_name = user_data.get("full_name")
    role = user_data.get("role", "user")
    station_id = user_data.get("station_id")

    if not username or not password or not full_name:
        raise HTTPException(status_code=400, detail="Username, password, and full_name are required")

    # Managers can only create attendants and supervisors
    caller_role = current_user.get("role", "")
    if hasattr(caller_role, 'value'):
        caller_role = caller_role.value
    if caller_role == "manager" and role not in ["user", "supervisor"]:
        raise HTTPException(status_code=403, detail="Managers can only create attendant and supervisor accounts")

    # Reject a station_id that doesn't exist (typed or sent by mistake). Owner
    # accounts intentionally have no station, so skip validation in that case.
    if role != "owner":
        _validate_station_id(station_id)

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_create_user
        if db_get_user_by_username(username):
            raise HTTPException(status_code=400, detail="Username already exists")

        user_id = _next_staff_id()
        hashed = _hash_password(password)
        try:
            db_create_user(user_id, username, hashed, full_name, role,
                           station_id if role != "owner" else None)
            _set_user_fields(username, _due_now_unless_owner(role))
        except Exception as e:
            logger.error(f"[auth] create_user DB insert failed for {username}: {e}")
            raise HTTPException(status_code=400, detail="Could not create user. Please try again.")
    else:
        if username in users_db:
            raise HTTPException(status_code=400, detail="Username already exists")
        user_id = _next_staff_id()
        hashed = _hash_password(password)
        users_db[username] = {
            "user_id": user_id, "username": username, "password": hashed,
            "full_name": full_name, "role": role,
            "station_id": station_id if role != "owner" else None,
            "is_active": True,
            **_due_now_unless_owner(role),
        }
        _save_users_file()

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
def update_user(username: str, user_data: dict, current_user: dict = Depends(require_manager_or_owner)):
    """Update an existing user (Manager/Owner). Managers can only modify attendants and supervisors."""
    # Manager privilege guard
    caller_role = current_user.get("role", "")
    if hasattr(caller_role, 'value'): caller_role = caller_role.value
    if caller_role == "manager":
        # Check target user's role
        if _USE_DB():
            from ...database.db import db_get_user_by_username
            target = db_get_user_by_username(username)
        else:
            target = users_db.get(username)
        if target and target.get("role") in ["manager", "owner"]:
            raise HTTPException(status_code=403, detail="Managers cannot modify manager or owner accounts")
        if "role" in user_data and user_data["role"] not in ["user", "supervisor"]:
            raise HTTPException(status_code=403, detail="Managers can only assign attendant or supervisor roles")

    # Validate any incoming station change against the real stations registry.
    if "station_id" in user_data and user_data.get("role") != "owner":
        _validate_station_id(user_data.get("station_id"))

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
            fields.update(_due_now_unless_owner(fields.get("role", user["role"])))

        if fields:
            db_update_user(username, _db_safe_fields(fields))

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
            user.update(_due_now_unless_owner(user["role"]))
        user_id = user["user_id"]
        _save_users_file()

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
def delete_user(username: str, current_user: dict = Depends(require_manager_or_owner)):
    """Delete a user (Manager/Owner). Managers cannot delete managers or owners."""
    # Manager privilege guard
    caller_role = current_user.get("role", "")
    if hasattr(caller_role, 'value'): caller_role = caller_role.value

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_delete_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Cannot delete owner account")
        if caller_role == "manager" and user["role"] in ["manager", "owner"]:
            raise HTTPException(status_code=403, detail="Managers cannot delete manager or owner accounts")

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
        _save_users_file()

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


@router.get("/staff")
def list_staff(ctx: dict = Depends(get_station_context)):
    """
    Get active attendants and supervisors for the current station.

    Strictly scoped: only users whose station_id matches the current station
    appear here, including when the caller is an owner viewing a specific
    station. Owner accounts (station_id=None) are never listed.
    """
    station_id = ctx.get("station_id")

    def visible(u: dict) -> bool:
        if u.get("role") not in ("user", "supervisor"):
            return False
        if not u.get("is_active", True):
            return False
        return (u.get("station_id") or None) == station_id

    if _USE_DB():
        from ...database.db import db_get_all_users
        users = db_get_all_users()
    else:
        users = list(users_db.values())

    return [
        {
            "user_id": u["user_id"], "username": u["username"],
            "full_name": u["full_name"], "role": u["role"],
            "station_id": u.get("station_id"),
            "is_active": u.get("is_active", True),
        }
        for u in users if visible(u)
    ]


@router.patch("/users/{username}/toggle-status")
def toggle_user_status(username: str, current_user: dict = Depends(require_manager_or_owner)):
    """Enable or disable a user account. Cannot disable owner/manager accounts (unless owner)."""
    caller_role = current_user.get("role", "")
    if hasattr(caller_role, 'value'): caller_role = caller_role.value

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_update_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Cannot disable owner accounts")
        if caller_role == "manager" and user["role"] in ["manager", "owner"]:
            raise HTTPException(status_code=403, detail="Managers cannot modify manager or owner accounts")

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
def reset_user_password(username: str, current_user: dict = Depends(require_manager_or_owner)):
    """Reset a user's password (Manager/Owner). Managers can only reset attendant/supervisor passwords."""
    caller_role = current_user.get("role", "")
    if hasattr(caller_role, 'value'): caller_role = caller_role.value
    # Check target user role for manager guard
    if caller_role == "manager":
        if _USE_DB():
            from ...database.db import db_get_user_by_username
            target = db_get_user_by_username(username)
        else:
            target = users_db.get(username)
        if target and target.get("role") in ["manager", "owner"]:
            raise HTTPException(status_code=403, detail="Managers cannot reset manager or owner passwords")

    # Generate random 12-char password
    alphabet = string.ascii_letters + string.digits
    new_password = ''.join(secrets.choice(alphabet) for _ in range(12))
    hashed = _hash_password(new_password)

    if _USE_DB():
        from ...database.db import db_get_user_by_username, db_update_user, db_delete_user_sessions
        user = db_get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        db_update_user(username, _db_safe_fields({"password": hashed, **_due_now_unless_owner(user["role"])}))
        # Invalidate existing sessions so user must re-login
        db_delete_user_sessions(username)
        user_id = user["user_id"]
    else:
        if username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        users_db[username]["password"] = hashed
        users_db[username].update(_due_now_unless_owner(users_db[username]["role"]))
        _save_users_file()
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


# ──────────────────────────────────────────────────────────
# Password expiry: status, self-service change, owner countdown, devices
# ──────────────────────────────────────────────────────────

def _token_from(authorization: Optional[str]) -> str:
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1]
    return authorization or ""


def _deadline_message(summary: dict) -> str:
    pending = summary["pending"]
    if not pending:
        return "Every staff member changed their password in time."
    names = ", ".join(p["full_name"] for p in pending[:10])
    more = len(pending) - 10
    return (f"{len(pending)} staff had not changed their password and must change it at their next "
            f"sign-in: {names}" + (f", and {more} more" if more > 0 else "") + ".")


def _owner_campaign() -> Optional[dict]:
    """The owner's countdown summary; sends the deadline message once when it passes."""
    summary = pwp.campaign_summary(_all_user_records())
    if not summary:
        return None
    if summary["deadline_passed"] and not summary["deadline_notified"]:
        try:
            create_notification(
                station_id=summary.get("station_id") or DEFAULT_STATION_ID,
                type="PASSWORD_CAMPAIGN_DEADLINE", severity="warning",
                title="Password change deadline reached",
                message=_deadline_message(summary),
                entity_type="password_campaign", entity_id=summary["started_at"],
                created_by="system",
            )
            pwp.mark_deadline_notified()
            summary["deadline_notified"] = True
        except Exception as e:
            logger.warning(f"[auth] password deadline notification failed: {e}")
    summary.pop("station_id", None)
    return summary


@router.get("/password-status")
def password_status(request: Request, current_user: dict = Depends(get_current_user)):
    """Reminder / forced-change status for the signed-in user, plus the owner's countdown view."""
    user = _get_user_record(current_user["username"]) or {}
    station = request.headers.get("x-station-id") or current_user.get("station_id") or DEFAULT_STATION_ID
    out = {
        "password_status": pwp.status(user),
        "device_shared": pwp.device_is_shared(station, request.headers.get("x-device-id")),
    }
    if pwp.is_exempt(current_user.get("role")):
        out["campaign"] = _owner_campaign()
    return out


@router.post("/change-password")
def change_password(data: dict, authorization: Optional[str] = Header(None),
                    current_user: dict = Depends(get_current_user)):
    """The signed-in user changes their own password (current + new)."""
    username = current_user["username"]
    user = _get_user_record(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if not _verify_password(current, user["password"]):
        raise HTTPException(status_code=400, detail="Your current password is not correct.")
    pwp.validate_new_password(username, current, new)

    now = pwp.utcnow()
    _set_user_fields(username, {
        "password": _hash_password(new),
        "password_changed_at": now.isoformat(),
        "password_change_due": None if pwp.is_exempt(user.get("role")) else pwp.next_rotation(now),
    })
    # Sign the user out everywhere else; this device stays signed in.
    if _USE_DB():
        from ...database.db import db_delete_user_sessions_except
        db_delete_user_sessions_except(username, _token_from(authorization))

    log_audit_event(
        station_id=current_user.get("station_id") or DEFAULT_STATION_ID,
        action="user_password_changed", performed_by=username,
        entity_type="user", entity_id=user["user_id"], details={"username": username},
    )
    return {"message": "Password changed.", "password_status": pwp.status(_get_user_record(username) or {})}


def launch_password_campaign(deadline: str, started_by: str, station_id: str,
                             by_system: bool = False) -> dict:
    """
    Give every staff member (not owners) until `deadline` to change their
    password, record the countdown and tell the owner. Used by the owner's
    button (7 days from today) and by one-off system launches.
    """
    if _USE_DB():
        from ...database.db import db_ensure_password_columns
        if not db_ensure_password_columns():
            raise HTTPException(status_code=503,
                                detail="The password settings are not ready yet. Please try again in a minute.")
    now = pwp.utcnow()
    staff = [u for u in _all_user_records() if not pwp.is_exempt(u.get("role"))]
    for u in staff:
        due = pwp._parse(u.get("password_change_due"))
        # Someone already due sooner (e.g. just reset) keeps the earlier date
        if not due or due > pwp._parse(deadline):
            _set_user_fields(u["username"], {"password_change_due": deadline})
    pwp.start_campaign([u["username"] for u in staff], started_by, station_id, now, deadline=deadline)

    days = (pwp._parse(deadline).astimezone(pwp.CAT).date() - now.astimezone(pwp.CAT).date()).days
    last_day = (pwp._parse(deadline).astimezone(pwp.CAT) - timedelta(days=1)).strftime("%d/%m/%Y")
    log_audit_event(station_id=station_id, action="password_campaign_start",
                    performed_by=started_by, entity_type="password_campaign",
                    entity_id=deadline, details={"staff": len(staff), "deadline": deadline,
                                                 "by_system": by_system})
    try:
        create_notification(
            station_id=station_id, type="PASSWORD_CAMPAIGN_START", severity="info",
            title="Password change started" + (" by the system" if by_system else ""),
            message=(f"{len(staff)} staff (attendants, supervisors and managers) have {days} day"
                     f"{'' if days == 1 else 's'} to change their password, until the end of {last_day}. "
                     f"A prompt has been sent to them. After that they will have to change it before "
                     f"they can continue."),
            entity_type="password_campaign", entity_id=deadline, created_by=started_by,
        )
    except Exception as e:
        logger.warning(f"[auth] password campaign notification failed: {e}")
    return _owner_campaign()


@router.post("/password-campaign")
def start_password_campaign(current_user: dict = Depends(require_owner)):
    """Owner: every staff member (not owners) must change their password within 7 days."""
    existing = pwp.campaign_summary(_all_user_records())
    if existing and not existing["deadline_passed"]:
        raise HTTPException(status_code=400, detail="A password change countdown is already running.")
    return launch_password_campaign(pwp.start_of_day_in(pwp.CAMPAIGN_DAYS), current_user["username"],
                                    current_user.get("station_id") or DEFAULT_STATION_ID)


@router.get("/devices", dependencies=[Depends(require_manager_or_owner)])
def list_devices(ctx: dict = Depends(get_station_context)):
    """Devices people have signed in on at this station, and whether each counts as shared."""
    names = {u["username"]: (u.get("full_name") or u["username"]) for u in _all_user_records()}
    rows = []
    for d in pwp.load_devices(ctx["station_id"]).values():
        users = sorted((d.get("users") or {}).items(), key=lambda kv: kv[1], reverse=True)
        rows.append({
            "device_id": d["device_id"], "label": d.get("label") or "",
            "override": d.get("override"), "shared": pwp.is_shared(d),
            "first_seen": d.get("first_seen"), "last_seen": d.get("last_seen"),
            "user_agent": d.get("user_agent", ""),
            "users": [{"username": u, "full_name": names.get(u, u), "last_seen": t} for u, t in users],
        })
    rows.sort(key=lambda r: r.get("last_seen") or "", reverse=True)
    return rows


@router.patch("/devices/{device_id}", dependencies=[Depends(require_manager_or_owner)])
def update_device(device_id: str, data: dict, ctx: dict = Depends(get_station_context)):
    """Mark a device shared / personal (or back to automatic), and name it."""
    d = pwp.set_device(ctx["station_id"], device_id, data.get("override"), data.get("label"))
    log_audit_event(station_id=ctx["station_id"], action="device_update", performed_by=ctx["username"],
                    entity_type="device", entity_id=device_id,
                    details={"override": d.get("override"), "label": d.get("label")})
    return {**d, "shared": pwp.is_shared(d)}
