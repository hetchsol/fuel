"""
Database Layer
Provides PostgreSQL persistence via JSONB.
Falls back to file-based storage when DATABASE_URL is not set.

Uses psycopg (v3) for PostgreSQL connectivity.
"""
import os
import json
import logging
from typing import Any, Optional, List
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

# Single connection (lazy-initialized)
_conn = None


def _get_connection():
    """Get a database connection (lazy-init on first call)."""
    global _conn
    if _conn is None or _conn.closed:
        try:
            import psycopg
            _conn = psycopg.connect(DATABASE_URL, autocommit=False)
            logger.info("[db] PostgreSQL connection established")
        except Exception as e:
            logger.error(f"[db] Failed to connect: {e}")
            raise
    return _conn


def is_db_available() -> bool:
    """Check if PostgreSQL is configured and reachable."""
    if not DATABASE_URL:
        return False
    try:
        conn = _get_connection()
        conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def init_db():
    """Create tables if they don't exist. Call once at startup."""
    if not DATABASE_URL:
        logger.info("[db] No DATABASE_URL set — using file-based storage")
        return False

    conn = _get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS stations (
                station_id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS station_storage (
                station_id TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (station_id)
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS station_files (
                station_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (station_id, filename)
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id    TEXT PRIMARY KEY,
                username   TEXT UNIQUE NOT NULL,
                password   TEXT NOT NULL,
                full_name  TEXT NOT NULL,
                role       TEXT NOT NULL DEFAULT 'user',
                station_id TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                username   TEXT NOT NULL,
                role       TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            );
        """)
        conn.commit()
        logger.info("[db] PostgreSQL schema initialized")
        return True
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] Schema init failed: {e}")
        raise


def close_db():
    """Close the connection. Call on shutdown."""
    global _conn
    if _conn and not _conn.closed:
        _conn.close()
        _conn = None
        logger.info("[db] Connection closed")


# ──────────────────────────────────────────────────────────
# Station Files — replaces JSON file I/O
# ──────────────────────────────────────────────────────────

def db_load_json(station_id: str, filename: str, default: Any = None) -> Any:
    """Load JSON data for a station file from PostgreSQL."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT data FROM station_files WHERE station_id = %s AND filename = %s",
            (station_id, filename)
        ).fetchone()
        if row:
            return row[0]
        return default if default is not None else None
    except Exception as e:
        logger.error(f"[db] load_json failed ({station_id}/{filename}): {e}")
        return default if default is not None else None


def db_save_json(station_id: str, filename: str, data: Any):
    """Save JSON data for a station file to PostgreSQL."""
    conn = _get_connection()
    try:
        from psycopg.types.json import Jsonb
        conn.execute("""
            INSERT INTO station_files (station_id, filename, data, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (station_id, filename)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        """, (station_id, filename, Jsonb(data)))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] save_json failed ({station_id}/{filename}): {e}")
        raise


# ──────────────────────────────────────────────────────────
# Station Storage — replaces in-memory dict persistence
# ──────────────────────────────────────────────────────────

def db_load_storage(station_id: str) -> Optional[dict]:
    """Load the full storage dict for a station from PostgreSQL."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT data FROM station_storage WHERE station_id = %s",
            (station_id,)
        ).fetchone()
        if row:
            return row[0]
        return None
    except Exception as e:
        logger.error(f"[db] load_storage failed ({station_id}): {e}")
        return None


def db_save_storage(station_id: str, data: dict):
    """Save the full storage dict for a station to PostgreSQL."""
    conn = _get_connection()
    try:
        from psycopg.types.json import Jsonb
        conn.execute("""
            INSERT INTO station_storage (station_id, data, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (station_id)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        """, (station_id, Jsonb(data)))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] save_storage failed ({station_id}): {e}")
        raise


# ──────────────────────────────────────────────────────────
# Stations Registry — replaces stations.json
# ──────────────────────────────────────────────────────────

def db_load_stations() -> dict:
    """Load all stations from PostgreSQL."""
    conn = _get_connection()
    try:
        rows = conn.execute("SELECT station_id, data FROM stations").fetchall()
        return {row[0]: row[1] for row in rows}
    except Exception as e:
        logger.error(f"[db] load_stations failed: {e}")
        return {}


def db_save_station(station_id: str, data: dict):
    """Save a single station to PostgreSQL."""
    conn = _get_connection()
    try:
        from psycopg.types.json import Jsonb
        conn.execute("""
            INSERT INTO stations (station_id, data, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (station_id)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        """, (station_id, Jsonb(data)))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] save_station failed ({station_id}): {e}")
        raise


def db_save_all_stations(stations: dict):
    """Save all stations to PostgreSQL (bulk upsert)."""
    conn = _get_connection()
    try:
        from psycopg.types.json import Jsonb
        for station_id, data in stations.items():
            conn.execute("""
                INSERT INTO stations (station_id, data, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (station_id)
                DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
            """, (station_id, Jsonb(data)))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] save_all_stations failed: {e}")
        raise


# ──────────────────────────────────────────────────────────
# Users — auth user management
# ──────────────────────────────────────────────────────────

def db_get_user_by_username(username: str) -> Optional[dict]:
    """Get a user by username."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, username, password, full_name, role, station_id FROM users WHERE username = %s",
            (username,)
        ).fetchone()
        if row:
            return {
                "user_id": row[0], "username": row[1], "password": row[2],
                "full_name": row[3], "role": row[4], "station_id": row[5],
            }
        return None
    except Exception as e:
        logger.error(f"[db] get_user_by_username failed: {e}")
        return None


def db_get_all_users() -> List[dict]:
    """Get all users."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT user_id, username, password, full_name, role, station_id FROM users ORDER BY user_id"
        ).fetchall()
        return [
            {"user_id": r[0], "username": r[1], "password": r[2],
             "full_name": r[3], "role": r[4], "station_id": r[5]}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"[db] get_all_users failed: {e}")
        return []


def db_create_user(user_id: str, username: str, password_hash: str,
                   full_name: str, role: str, station_id: Optional[str] = None):
    """Insert a new user."""
    conn = _get_connection()
    try:
        conn.execute(
            """INSERT INTO users (user_id, username, password, full_name, role, station_id)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (user_id, username, password_hash, full_name, role, station_id)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] create_user failed: {e}")
        raise


def db_update_user(username: str, fields: dict):
    """Update user fields by username. `fields` may contain full_name, role, station_id, password."""
    conn = _get_connection()
    try:
        sets, vals = [], []
        for col in ("full_name", "role", "station_id", "password"):
            if col in fields:
                sets.append(f"{col} = %s")
                vals.append(fields[col])
        if not sets:
            return
        sets.append("updated_at = NOW()")
        vals.append(username)
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE username = %s", vals)
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] update_user failed: {e}")
        raise


def db_delete_user(username: str):
    """Delete a user by username."""
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM users WHERE username = %s", (username,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_user failed: {e}")
        raise


def db_count_users_by_prefix(prefix: str) -> int:
    """Count users whose user_id starts with a given prefix."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM users WHERE user_id LIKE %s", (f"{prefix}%",)
        ).fetchone()
        return row[0] if row else 0
    except Exception as e:
        logger.error(f"[db] count_users_by_prefix failed: {e}")
        return 0


# ──────────────────────────────────────────────────────────
# Sessions — auth session management
# ──────────────────────────────────────────────────────────

def db_create_session(token: str, user_id: str, username: str, role: str,
                      expires_at: datetime):
    """Create a new session."""
    conn = _get_connection()
    try:
        conn.execute(
            """INSERT INTO sessions (token, user_id, username, role, expires_at)
               VALUES (%s, %s, %s, %s, %s)""",
            (token, user_id, username, role, expires_at)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] create_session failed: {e}")
        raise


def db_get_session(token: str) -> Optional[dict]:
    """Get a session by token, only if not expired."""
    conn = _get_connection()
    try:
        row = conn.execute(
            """SELECT token, user_id, username, role, expires_at FROM sessions
               WHERE token = %s AND expires_at > NOW()""",
            (token,)
        ).fetchone()
        if row:
            return {
                "token": row[0], "user_id": row[1], "username": row[2],
                "role": row[3], "expires_at": row[4],
            }
        return None
    except Exception as e:
        logger.error(f"[db] get_session failed: {e}")
        return None


def db_delete_session(token: str):
    """Delete a specific session."""
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE token = %s", (token,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_session failed: {e}")


def db_delete_user_sessions(username: str):
    """Delete all sessions for a user."""
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE username = %s", (username,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_user_sessions failed: {e}")


def db_cleanup_expired_sessions():
    """Remove all expired sessions."""
    conn = _get_connection()
    try:
        result = conn.execute("DELETE FROM sessions WHERE expires_at <= NOW()")
        conn.commit()
        count = result.rowcount
        if count:
            logger.info(f"[db] Cleaned up {count} expired sessions")
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] cleanup_expired_sessions failed: {e}")
