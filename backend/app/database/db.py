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

# Single connection (lazy-initialized, with reconnect on stale)
_conn = None
_db_available = False  # Set to True only after successful init_db()


def is_db_active() -> bool:
    """Check if DB was successfully initialized at startup."""
    return _db_available


def _get_connection():
    """Get a database connection, reconnecting if stale. Returns None on failure."""
    global _conn
    if not _db_available and _conn is None:
        return None

    if _conn is not None and not _conn.closed:
        try:
            _conn.execute("SELECT 1")
            return _conn
        except Exception:
            logger.warning("[db] Stale connection detected, reconnecting...")
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None

    try:
        import psycopg
        _conn = psycopg.connect(DATABASE_URL, autocommit=False, connect_timeout=10)
        logger.info("[db] PostgreSQL connection established")
    except Exception as e:
        logger.error(f"[db] Failed to connect: {e}")
        return None
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
    global _conn, _db_available

    if not DATABASE_URL:
        logger.info("[db] No DATABASE_URL set — using file-based storage")
        return False

    # Use direct (non-pooler) connection for DDL — Neon/PgBouncer poolers
    # don't support DDL or SET commands reliably in transaction mode
    direct_url = DATABASE_URL.replace("-pooler.", ".")
    logger.info("[db] Connecting to PostgreSQL (direct for DDL)...")
    try:
        import psycopg
        _conn = psycopg.connect(direct_url, autocommit=True, connect_timeout=15)
        logger.info("[db] PostgreSQL connection established")
    except Exception as e:
        logger.error(f"[db] Failed to connect: {e}")
        _conn = None
        _db_available = False
        return False

    try:
        logger.info("[db] Creating tables...")
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS stations (
                station_id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS station_storage (
                station_id TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (station_id)
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS station_files (
                station_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (station_id, filename)
            );
        """)
        _conn.execute("""
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
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                username   TEXT NOT NULL,
                role       TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            );
        """)
        logger.info("[db] Core tables created")

        # ── Payroll tables ─────────────────────────────────────────
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS wcf_categories (
                category_id    TEXT PRIMARY KEY,
                category_name  TEXT NOT NULL,
                rate_percent   NUMERIC(7,4) NOT NULL DEFAULT 0.01,
                description    TEXT,
                effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
                is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                created_at     TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS statutory_rates (
                rate_id                     TEXT PRIMARY KEY,
                paye_bands                  JSONB NOT NULL,
                napsa_employee_rate         NUMERIC(7,4) NOT NULL DEFAULT 0.05,
                napsa_employer_rate         NUMERIC(7,4) NOT NULL DEFAULT 0.05,
                napsa_monthly_ceiling       NUMERIC(12,2) NOT NULL DEFAULT 1073.18,
                nhima_employee_rate         NUMERIC(7,4) NOT NULL DEFAULT 0.01,
                nhima_employer_rate         NUMERIC(7,4) NOT NULL DEFAULT 0.01,
                overtime_weekday_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
                overtime_weekend_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.0,
                standard_hours_per_week     INTEGER NOT NULL DEFAULT 48,
                effective_from              DATE NOT NULL,
                created_by                  TEXT REFERENCES users(user_id),
                created_at                  TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS employee_profiles (
                profile_id                TEXT PRIMARY KEY,
                user_id                   TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                station_id                TEXT,
                basic_salary              NUMERIC(12,2) NOT NULL DEFAULT 0,
                housing_allowance         NUMERIC(12,2) NOT NULL DEFAULT 0,
                transport_allowance       NUMERIC(12,2) NOT NULL DEFAULT 0,
                employment_type           TEXT NOT NULL DEFAULT 'permanent',
                contracted_hours_per_week INTEGER NOT NULL DEFAULT 48,
                annual_leave_days         INTEGER NOT NULL DEFAULT 24,
                start_date                DATE,
                nrc_number                TEXT,
                tpin                      TEXT,
                napsa_number              TEXT,
                nhima_number              TEXT,
                bank_name                 TEXT,
                bank_branch               TEXT,
                bank_account_number       TEXT,
                mobile_money_provider     TEXT,
                mobile_money_number       TEXT,
                preferred_payment_method  TEXT NOT NULL DEFAULT 'bank',
                wcf_category_id           TEXT REFERENCES wcf_categories(category_id),
                is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
                created_at                TIMESTAMP DEFAULT NOW(),
                updated_at                TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, station_id)
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS leave_types (
                type_id                TEXT PRIMARY KEY,
                type_name              TEXT NOT NULL UNIQUE,
                days_per_year          NUMERIC(5,1),
                full_pay_days          INTEGER,
                half_pay_days          INTEGER,
                requires_documentation BOOLEAN NOT NULL DEFAULT FALSE,
                is_system              BOOLEAN NOT NULL DEFAULT FALSE,
                created_at             TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS leave_balances (
                balance_id    TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                leave_type_id TEXT NOT NULL REFERENCES leave_types(type_id),
                year          INTEGER NOT NULL,
                days_entitled NUMERIC(5,1) NOT NULL DEFAULT 0,
                days_accrued  NUMERIC(5,1) NOT NULL DEFAULT 0,
                days_taken    NUMERIC(5,1) NOT NULL DEFAULT 0,
                carry_forward NUMERIC(5,1) NOT NULL DEFAULT 0,
                UNIQUE(user_id, leave_type_id, year)
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS leave_requests (
                request_id     TEXT PRIMARY KEY,
                user_id        TEXT NOT NULL REFERENCES users(user_id),
                leave_type_id  TEXT NOT NULL REFERENCES leave_types(type_id),
                start_date     DATE NOT NULL,
                end_date       DATE NOT NULL,
                days_requested NUMERIC(5,1) NOT NULL,
                status         TEXT NOT NULL DEFAULT 'pending',
                approved_by    TEXT REFERENCES users(user_id),
                notes          TEXT,
                manager_notes  TEXT,
                created_at     TIMESTAMP DEFAULT NOW(),
                updated_at     TIMESTAMP DEFAULT NOW(),
                approved_at    TIMESTAMP
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS attendance_records (
                record_id        TEXT PRIMARY KEY,
                user_id          TEXT NOT NULL REFERENCES users(user_id),
                station_id       TEXT,
                work_date        DATE NOT NULL,
                status           TEXT NOT NULL DEFAULT 'present',
                regular_hours    NUMERIC(4,2) NOT NULL DEFAULT 8.0,
                overtime_hours   NUMERIC(4,2) NOT NULL DEFAULT 0,
                overtime_type    TEXT NOT NULL DEFAULT 'none',
                leave_request_id TEXT REFERENCES leave_requests(request_id),
                notes            TEXT,
                recorded_by      TEXT REFERENCES users(user_id),
                created_at       TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, work_date)
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS public_holidays (
                holiday_id       TEXT PRIMARY KEY,
                holiday_name     TEXT NOT NULL,
                holiday_date     DATE NOT NULL,
                is_recurring     BOOLEAN NOT NULL DEFAULT FALSE,
                recurrence_month INTEGER,
                recurrence_day   INTEGER,
                notes            TEXT,
                created_at       TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS salary_advances (
                advance_id          TEXT PRIMARY KEY,
                user_id             TEXT NOT NULL REFERENCES users(user_id),
                station_id          TEXT,
                amount              NUMERIC(12,2) NOT NULL,
                reason              TEXT,
                approved_by         TEXT REFERENCES users(user_id),
                date_issued         DATE,
                repayment_months    INTEGER NOT NULL DEFAULT 1,
                monthly_deduction   NUMERIC(12,2) NOT NULL,
                outstanding_balance NUMERIC(12,2) NOT NULL,
                status              TEXT NOT NULL DEFAULT 'pending',
                created_at          TIMESTAMP DEFAULT NOW(),
                updated_at          TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS payroll_runs (
                run_id               TEXT PRIMARY KEY,
                station_id           TEXT NOT NULL,
                period_month         INTEGER NOT NULL,
                period_year          INTEGER NOT NULL,
                status               TEXT NOT NULL DEFAULT 'draft',
                is_historical        BOOLEAN NOT NULL DEFAULT FALSE,
                total_gross          NUMERIC(14,2) DEFAULT 0,
                total_basic          NUMERIC(14,2) DEFAULT 0,
                total_allowances     NUMERIC(14,2) DEFAULT 0,
                total_overtime       NUMERIC(14,2) DEFAULT 0,
                total_paye           NUMERIC(14,2) DEFAULT 0,
                total_napsa_employee NUMERIC(14,2) DEFAULT 0,
                total_napsa_employer NUMERIC(14,2) DEFAULT 0,
                total_nhima_employee NUMERIC(14,2) DEFAULT 0,
                total_nhima_employer NUMERIC(14,2) DEFAULT 0,
                total_wcf_employer   NUMERIC(14,2) DEFAULT 0,
                total_advances       NUMERIC(14,2) DEFAULT 0,
                total_net            NUMERIC(14,2) DEFAULT 0,
                total_employer_cost  NUMERIC(14,2) DEFAULT 0,
                statutory_rate_id    TEXT REFERENCES statutory_rates(rate_id),
                created_by           TEXT REFERENCES users(user_id),
                approved_by          TEXT REFERENCES users(user_id),
                created_at           TIMESTAMP DEFAULT NOW(),
                approved_at          TIMESTAMP,
                UNIQUE(station_id, period_month, period_year)
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS payslips (
                payslip_id              TEXT PRIMARY KEY,
                run_id                  TEXT NOT NULL REFERENCES payroll_runs(run_id) ON DELETE CASCADE,
                user_id                 TEXT NOT NULL REFERENCES users(user_id),
                station_id              TEXT,
                is_historical           BOOLEAN NOT NULL DEFAULT FALSE,
                basic_salary            NUMERIC(12,2) NOT NULL DEFAULT 0,
                housing_allowance       NUMERIC(12,2) NOT NULL DEFAULT 0,
                transport_allowance     NUMERIC(12,2) NOT NULL DEFAULT 0,
                other_allowances        NUMERIC(12,2) NOT NULL DEFAULT 0,
                overtime_pay            NUMERIC(12,2) NOT NULL DEFAULT 0,
                overtime_details        JSONB DEFAULT '[]',
                gross_salary            NUMERIC(12,2) NOT NULL DEFAULT 0,
                napsa_employee_calc     NUMERIC(12,2) NOT NULL DEFAULT 0,
                nhima_employee_calc     NUMERIC(12,2) NOT NULL DEFAULT 0,
                paye_calc               NUMERIC(12,2) NOT NULL DEFAULT 0,
                napsa_employee_override NUMERIC(12,2),
                nhima_employee_override NUMERIC(12,2),
                paye_override           NUMERIC(12,2),
                custom_deductions       JSONB DEFAULT '[]',
                advances_deducted       NUMERIC(12,2) NOT NULL DEFAULT 0,
                total_deductions        NUMERIC(12,2) NOT NULL DEFAULT 0,
                net_pay                 NUMERIC(12,2) NOT NULL DEFAULT 0,
                napsa_employer          NUMERIC(12,2) NOT NULL DEFAULT 0,
                nhima_employer          NUMERIC(12,2) NOT NULL DEFAULT 0,
                wcf_employer            NUMERIC(12,2) NOT NULL DEFAULT 0,
                total_employer_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
                attendance_days         INTEGER,
                leave_days_taken        NUMERIC(5,1),
                notes                   TEXT,
                created_at              TIMESTAMP DEFAULT NOW(),
                updated_at              TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS advance_repayments (
                repayment_id   TEXT PRIMARY KEY,
                advance_id     TEXT NOT NULL REFERENCES salary_advances(advance_id),
                payslip_id     TEXT REFERENCES payslips(payslip_id),
                amount         NUMERIC(12,2) NOT NULL,
                repayment_date DATE NOT NULL,
                created_at     TIMESTAMP DEFAULT NOW()
            );
        """)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS payroll_payments (
                payment_id            TEXT PRIMARY KEY,
                run_id                TEXT NOT NULL REFERENCES payroll_runs(run_id),
                user_id               TEXT NOT NULL REFERENCES users(user_id),
                payslip_id            TEXT REFERENCES payslips(payslip_id),
                net_amount            NUMERIC(12,2) NOT NULL,
                payment_method        TEXT NOT NULL DEFAULT 'bank',
                bank_name             TEXT,
                bank_account_number   TEXT,
                mobile_money_provider TEXT,
                mobile_money_number   TEXT,
                payment_reference     TEXT,
                status                TEXT NOT NULL DEFAULT 'pending',
                submitted_at          TIMESTAMP,
                confirmed_at          TIMESTAMP,
                notes                 TEXT,
                created_at            TIMESTAMP DEFAULT NOW()
            );
        """)
        logger.info("[db] Payroll tables created")

        # ── Payroll seed data (idempotent) ─────────────────────────
        _conn.execute("""
            INSERT INTO wcf_categories
                (category_id, category_name, rate_percent, description, effective_from)
            VALUES ('WCF001','Petroleum Retail',0.01,'Fuel stations and petroleum retail outlets','2024-01-01')
            ON CONFLICT (category_id) DO NOTHING;
        """)
        _conn.execute("""
            INSERT INTO statutory_rates (
                rate_id, paye_bands,
                napsa_employee_rate, napsa_employer_rate, napsa_monthly_ceiling,
                nhima_employee_rate, nhima_employer_rate,
                overtime_weekday_multiplier, overtime_weekend_multiplier,
                standard_hours_per_week, effective_from
            ) VALUES (
                'RATE2024',
                '[{"min":0,"max":4800,"rate":0.00,"label":"0%"},{"min":4800.01,"max":6800,"rate":0.20,"label":"20%"},{"min":6800.01,"max":8000,"rate":0.30,"label":"30%"},{"min":8000.01,"max":null,"rate":0.375,"label":"37.5%"}]',
                0.05,0.05,1073.18,0.01,0.01,1.5,2.0,48,'2024-01-01'
            ) ON CONFLICT (rate_id) DO NOTHING;
        """)
        for lt in [
            ("LT001","Annual",       24.0, None, None, False, True),
            ("LT002","Sick",         None,   42,   42, True,  True),
            ("LT003","Maternity",    None,   98, None, True,  True),
            ("LT004","Paternity",     5.0, None, None, False, True),
            ("LT005","Compassionate", 5.0, None, None, True,  True),
            ("LT006","Unpaid",       None, None, None, False, True),
        ]:
            _conn.execute("""
                INSERT INTO leave_types
                    (type_id,type_name,days_per_year,full_pay_days,half_pay_days,requires_documentation,is_system)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (type_name) DO NOTHING;
            """, lt)
        # Official Zambian public holidays 2026 — fully configurable via payroll settings
        for h in [
            ("PH001","New Year's Day",                         "2026-01-01",True, 1, 1, None),
            ("PH002","International Women's Day",              "2026-03-08",True, 3, 8, None),
            ("PH003","Day off for International Women's Day",  "2026-03-09",False,None,None,"Observed Monday when Women's Day falls on Sunday"),
            ("PH004","Youth Day",                              "2026-03-12",True, 3,12, None),
            ("PH005","Good Friday",                            "2026-04-03",False,None,None,None),
            ("PH006","Holy Saturday",                          "2026-04-04",False,None,None,None),
            ("PH007","Easter Monday",                          "2026-04-06",False,None,None,None),
            ("PH008","Kenneth Kaunda Day",                     "2026-04-28",True, 4,28, None),
            ("PH009","Labour Day",                             "2026-05-01",True, 5, 1, None),
            ("PH010","Africa Freedom Day",                     "2026-05-25",True, 5,25, None),
            ("PH011","Heroes' Day",                            "2026-07-06",False,None,None,"First Monday of July"),
            ("PH012","Unity Day",                              "2026-07-07",False,None,None,"First Tuesday of July"),
            ("PH013","Farmers' Day",                           "2026-08-03",False,None,None,"First Monday of August"),
            ("PH014","Prayer Day",                             "2026-10-18",True,10,18, None),
            ("PH015","Day off for Prayer Day",                 "2026-10-19",False,None,None,"Observed Monday when Prayer Day falls on Sunday"),
            ("PH016","Independence Day",                       "2026-10-24",True,10,24, None),
            ("PH017","Christmas Day",                          "2026-12-25",True,12,25, None),
            ("PH018","Declaration of Zambia as a Christian Nation","2026-12-29",False,None,None,"Tentative"),
        ]:
            _conn.execute("""
                INSERT INTO public_holidays
                    (holiday_id,holiday_name,holiday_date,is_recurring,recurrence_month,recurrence_day,notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (holiday_id) DO NOTHING;
            """, h)
        logger.info("[db] Payroll seed data inserted")
        logger.info("[db] Tables created")

        # Set statement timeout to prevent hanging on slow Neon connections
        try:
            _conn.execute("SET statement_timeout = '5s'")
        except Exception:
            pass

        # Add is_active column if it doesn't exist (migration)
        try:
            _conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
            logger.info("[db] Migrations applied")
        except Exception as e:
            logger.warning(f"[db] Migration skipped (non-fatal): {e}")

        # Performance indexes (best effort — skip if slow)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)",
            "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
            "CREATE INDEX IF NOT EXISTS idx_users_station ON users(station_id)",
            "CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)",
        ]:
            try:
                _conn.execute(idx_sql)
            except Exception:
                pass
        logger.info("[db] Indexes done")

        # Reset timeout and switch to transactional mode for normal operations
        try:
            _conn.execute("SET statement_timeout = '0'")
        except Exception:
            pass
        _conn.close()
        _conn = psycopg.connect(DATABASE_URL, autocommit=False, connect_timeout=10)
        logger.info("[db] Switched to transactional mode")

        _db_available = True
        logger.info("[db] PostgreSQL schema initialized — DB is active")
        return True
    except Exception as e:
        _conn.rollback()
        _db_available = False
        logger.error(f"[db] Schema init failed: {e}")
        return False


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
            "SELECT user_id, username, password, full_name, role, station_id, is_active FROM users WHERE username = %s",
            (username,)
        ).fetchone()
        if row:
            return {
                "user_id": row[0], "username": row[1], "password": row[2],
                "full_name": row[3], "role": row[4], "station_id": row[5],
                "is_active": row[6] if row[6] is not None else True,
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
            "SELECT user_id, username, password, full_name, role, station_id, is_active FROM users ORDER BY user_id"
        ).fetchall()
        return [
            {"user_id": r[0], "username": r[1], "password": r[2],
             "full_name": r[3], "role": r[4], "station_id": r[5],
             "is_active": r[6] if r[6] is not None else True}
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
        for col in ("full_name", "role", "station_id", "password", "is_active"):
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


# ── Station deletion helpers ──────────────────────────────

def db_delete_station(station_id: str):
    """Delete a station from the stations table."""
    conn = _get_connection()
    if not conn:
        return
    try:
        conn.execute("DELETE FROM stations WHERE station_id = %s", (station_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_station failed: {e}")
        raise


def db_delete_station_storage(station_id: str):
    """Delete station storage (JSONB blob) for a station."""
    conn = _get_connection()
    if not conn:
        return
    try:
        conn.execute("DELETE FROM station_storage WHERE station_id = %s", (station_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_station_storage failed: {e}")
        raise


def db_delete_station_files(station_id: str):
    """Delete all per-station JSON files for a station."""
    conn = _get_connection()
    if not conn:
        return
    try:
        conn.execute("DELETE FROM station_files WHERE station_id = %s", (station_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] delete_station_files failed: {e}")
        raise


def db_deactivate_station_users(station_id: str) -> int:
    """Deactivate all users assigned to a station. Returns count."""
    conn = _get_connection()
    if not conn:
        return 0
    try:
        result = conn.execute(
            "UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE station_id = %s AND is_active = TRUE",
            (station_id,)
        )
        conn.commit()
        return result.rowcount
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] deactivate_station_users failed: {e}")
        raise


def db_reactivate_station_users(station_id: str) -> int:
    """Reactivate all users assigned to a station. Returns count."""
    conn = _get_connection()
    if not conn:
        return 0
    try:
        result = conn.execute(
            "UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE station_id = %s AND is_active = FALSE",
            (station_id,)
        )
        conn.commit()
        return result.rowcount
    except Exception as e:
        conn.rollback()
        logger.error(f"[db] reactivate_station_users failed: {e}")
