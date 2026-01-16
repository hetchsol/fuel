"""
Authentication API with Role-Based Access Control
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from ...models.models import UserLogin, User, UserRole
import hashlib
from typing import Optional

router = APIRouter()

# In-memory user database (in production, use a real database with hashed passwords)
users_db = {
    "user1": {
        "user_id": "U001",
        "username": "user1",
        "password": hashlib.sha256("password123".encode()).hexdigest(),  # Simple hash for demo
        "full_name": "Fashon Sakala",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "supervisor1": {
        "user_id": "S001",
        "username": "supervisor1",
        "password": hashlib.sha256("super123".encode()).hexdigest(),
        "full_name": "Barbara Banda",
        "role": UserRole.SUPERVISOR,
        "station_id": "ST001"
    },
    "owner1": {
        "user_id": "O001",
        "username": "owner1",
        "password": hashlib.sha256("owner123".encode()).hexdigest(),
        "full_name": "Kanyembo Ndhlovu",
        "role": UserRole.OWNER,
        "station_id": None
    },
    # Staff members
    "shaka": {
        "user_id": "STF001",
        "username": "shaka",
        "password": hashlib.sha256("shaka123".encode()).hexdigest(),
        "full_name": "Shaka",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "trevor": {
        "user_id": "STF002",
        "username": "trevor",
        "password": hashlib.sha256("trevor123".encode()).hexdigest(),
        "full_name": "Trevor",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "violet": {
        "user_id": "STF003",
        "username": "violet",
        "password": hashlib.sha256("violet123".encode()).hexdigest(),
        "full_name": "Violet",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "chileshe": {
        "user_id": "STF004",
        "username": "chileshe",
        "password": hashlib.sha256("chileshe123".encode()).hexdigest(),
        "full_name": "Chileshe",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "matthew": {
        "user_id": "STF005",
        "username": "matthew",
        "password": hashlib.sha256("matthew123".encode()).hexdigest(),
        "full_name": "Matthew",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "mubanga": {
        "user_id": "STF006",
        "username": "mubanga",
        "password": hashlib.sha256("mubanga123".encode()).hexdigest(),
        "full_name": "Mubanga",
        "role": UserRole.USER,
        "station_id": "ST001"
    },
    "prosper": {
        "user_id": "STF007",
        "username": "prosper",
        "password": hashlib.sha256("prosper123".encode()).hexdigest(),
        "full_name": "Prosper",
        "role": UserRole.USER,
        "station_id": "ST001"
    }
}

# Simple session storage (in production, use JWT tokens or Redis)
active_sessions = {}


# Authentication Dependencies for Role-Based Access Control
async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Extract and validate user from session token

    Args:
        authorization: Authorization header (Bearer token or direct token)

    Returns:
        User object with user_id, username, role, station_id

    Raises:
        HTTPException 401: If token is missing or invalid
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    # Handle both "Bearer token" and direct token formats
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]

    # Validate token exists in active sessions
    if token not in active_sessions:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    # Get session data
    session = active_sessions[token]
    username = session["username"]

    # Get full user data
    if username not in users_db:
        raise HTTPException(status_code=401, detail="User not found")

    user_data = users_db[username]

    return {
        "user_id": user_data["user_id"],
        "username": username,
        "full_name": user_data["full_name"],
        "role": user_data["role"],
        "station_id": user_data.get("station_id")
    }


async def require_supervisor_or_owner(current_user: dict = Depends(get_current_user)):
    """
    Restrict access to supervisors and owners only

    Args:
        current_user: User object from get_current_user dependency

    Returns:
        User object if authorized (role is supervisor or owner)

    Raises:
        HTTPException 403: If user role is not supervisor or owner
    """
    if current_user["role"] not in [UserRole.SUPERVISOR, UserRole.OWNER]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors and owners only."
        )

    return current_user


@router.post("/login")
def login(credentials: UserLogin):
    """
    Authenticate user and return role-based access token
    """
    username = credentials.username
    password = credentials.password

    # Check if user exists
    if username not in users_db:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_data = users_db[username]

    # Verify password
    hashed_password = hashlib.sha256(password.encode()).hexdigest()
    if hashed_password != user_data["password"]:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Create session token (simple implementation)
    session_token = f"token-{username}-{user_data['user_id']}"

    # Store session
    active_sessions[session_token] = {
        "user_id": user_data["user_id"],
        "username": username,
        "role": user_data["role"]
    }

    # Return user info and token
    return {
        "access_token": session_token,
        "token_type": "bearer",
        "user": {
            "user_id": user_data["user_id"],
            "username": username,
            "full_name": user_data["full_name"],
            "role": user_data["role"],
            "station_id": user_data.get("station_id")
        }
    }

@router.post("/logout")
def logout(token: str):
    """
    Logout user and invalidate session
    """
    if token in active_sessions:
        del active_sessions[token]
    return {"message": "Logged out successfully"}

@router.get("/me")
def get_user_info(token: str):
    """
    Get current logged-in user info
    """
    if token not in active_sessions:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    session = active_sessions[token]
    user_data = users_db[session["username"]]

    return {
        "user_id": user_data["user_id"],
        "username": user_data["username"],
        "full_name": user_data["full_name"],
        "role": user_data["role"],
        "station_id": user_data.get("station_id")
    }

@router.get("/users")
def list_users():
    """
    List all users (Owner only)
    """
    return [
        {
            "user_id": user["user_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "station_id": user.get("station_id")
        }
        for user in users_db.values()
    ]

@router.post("/users")
def create_user(user_data: dict):
    """
    Create a new user (Owner only)
    """
    username = user_data.get("username")
    password = user_data.get("password")
    full_name = user_data.get("full_name")
    role = user_data.get("role", "user")
    station_id = user_data.get("station_id")

    # Validate required fields
    if not username or not password or not full_name:
        raise HTTPException(status_code=400, detail="Username, password, and full_name are required")

    # Check if user already exists
    if username in users_db:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Generate user ID
    existing_ids = [u["user_id"] for u in users_db.values()]
    user_count = len([uid for uid in existing_ids if uid.startswith("STF")]) + 1
    user_id = f"STF{user_count:03d}"

    # Hash password
    hashed_password = hashlib.sha256(password.encode()).hexdigest()

    # Create user
    users_db[username] = {
        "user_id": user_id,
        "username": username,
        "password": hashed_password,
        "full_name": full_name,
        "role": role,
        "station_id": station_id if role != "owner" else None
    }

    return {
        "message": "User created successfully",
        "user": {
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "role": role,
            "station_id": station_id if role != "owner" else None
        }
    }

@router.put("/users/{username}")
def update_user(username: str, user_data: dict):
    """
    Update an existing user (Owner only)
    """
    if username not in users_db:
        raise HTTPException(status_code=404, detail="User not found")

    user = users_db[username]

    # Update fields
    if "full_name" in user_data:
        user["full_name"] = user_data["full_name"]
    if "role" in user_data:
        user["role"] = user_data["role"]
    if "station_id" in user_data:
        user["station_id"] = user_data["station_id"] if user_data["role"] != "owner" else None
    if "password" in user_data and user_data["password"]:
        user["password"] = hashlib.sha256(user_data["password"].encode()).hexdigest()

    return {
        "message": "User updated successfully",
        "user": {
            "user_id": user["user_id"],
            "username": username,
            "full_name": user["full_name"],
            "role": user["role"],
            "station_id": user.get("station_id")
        }
    }

@router.delete("/users/{username}")
def delete_user(username: str):
    """
    Delete a user (Owner only, cannot delete owner)
    """
    if username not in users_db:
        raise HTTPException(status_code=404, detail="User not found")

    user = users_db[username]

    # Cannot delete owner
    if user["role"] == "owner":
        raise HTTPException(status_code=403, detail="Cannot delete owner account")

    # Invalidate all sessions for this user
    sessions_to_remove = [token for token, session in active_sessions.items() if session["username"] == username]
    for token in sessions_to_remove:
        del active_sessions[token]

    # Delete user
    del users_db[username]

    return {"message": f"User {username} deleted successfully"}

@router.get("/staff")
def list_staff():
    """
    Get list of staff members for shift assignment (all roles except staff can see this)
    """
    return [
        {
            "user_id": user["user_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "station_id": user.get("station_id")
        }
        for user in users_db.values()
        if user["role"] in ["user", "supervisor"]
    ]
