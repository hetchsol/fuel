"""
Payroll API — all routes per the canonical contract in lib/payroll.ts.
Base prefix: /api/v1/payroll  (registered in __init__.py)
Requires DB — payroll is DB-only; returns 503 when DATABASE_URL is unset.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import uuid
import json
import csv
import io
from datetime import datetime, date

from ...models.models import (
    EmployeeProfile, EmployeeProfileUpsert,
    StatutoryRates, StatutoryRatesCreate,
    WcfCategory, WcfCategoryCreate, WcfCategoryUpdate,
    LeaveType, LeaveTypeCreate, LeaveTypeUpdate,
    LeaveBalance, LeaveRequest, LeaveRequestCreate, LeaveRequestAction,
    AttendanceRecord, AttendanceUpsert, AttendanceBulkUpsert,
    PublicHoliday, PublicHolidayCreate,
    SalaryAdvance, SalaryAdvanceCreate,
    Payslip, PayslipOverrides,
    PayrollRun, PayrollRunCreate, PayrollRunDetail,
    PayrollPayment,
    HistoricalImport,
)
from ...services.payroll_calculator import (
    calculate_payslip, recompute_totals, aggregate_run_totals,
)
from ...database.db import _get_connection, is_db_active
from ...services.audit_service import log_audit_event
from .auth import get_current_user, get_station_context, require_owner

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────

def _require_db():
    if not is_db_active():
        raise HTTPException(status_code=503, detail="Payroll requires a database connection")

def _uid() -> str:
    return str(uuid.uuid4())

def _now() -> str:
    return datetime.utcnow().isoformat()

def _fetchall(conn, sql: str, params=()) -> List[dict]:
    cur = conn.execute(sql, params)
    if not cur.description:
        return []
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

def _fetchone(conn, sql: str, params=()) -> Optional[dict]:
    cur = conn.execute(sql, params)
    if not cur.description:
        return None
    cols = [d.name for d in cur.description]
    row = cur.fetchone()
    return dict(zip(cols, row)) if row else None

def _station_id(ctx: dict) -> str:
    return ctx["station_id"]

def _active_rates(conn) -> dict:
    row = _fetchone(conn,
        "SELECT * FROM statutory_rates ORDER BY effective_from DESC LIMIT 1")
    if not row:
        raise HTTPException(status_code=404, detail="No statutory rates configured")
    if isinstance(row.get("paye_bands"), str):
        row["paye_bands"] = json.loads(row["paye_bands"])
    return row

def _wcf_rate(conn, category_id: Optional[str]) -> float:
    if not category_id:
        return 0.0
    row = _fetchone(conn,
        "SELECT rate_percent FROM wcf_categories WHERE category_id = %s AND is_active = TRUE",
        (category_id,))
    return float(row["rate_percent"]) if row else 0.0

def _str_dates(row: dict) -> dict:
    """Convert date/datetime objects in a row dict to ISO strings."""
    for k, v in row.items():
        if isinstance(v, (date, datetime)):
            row[k] = v.isoformat()
    return row


# ══════════════════════════════════════════════════════════
# Employee profiles
# GET /payroll/employees
# GET /payroll/employees/{user_id}
# PUT /payroll/employees/{user_id}
# ══════════════════════════════════════════════════════════

@router.get("/employees", response_model=List[EmployeeProfile])
def list_employees(
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    rows = _fetchall(conn,
        "SELECT * FROM employee_profiles WHERE station_id = %s ORDER BY created_at",
        (_station_id(ctx),))
    return [_str_dates(r) for r in rows]


@router.get("/employees/{user_id}", response_model=EmployeeProfile)
def get_employee(
    user_id: str,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    row = _fetchone(conn,
        "SELECT * FROM employee_profiles WHERE user_id = %s AND station_id = %s",
        (user_id, _station_id(ctx)))
    if not row:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    return _str_dates(row)


@router.put("/employees/{user_id}", response_model=EmployeeProfile)
def upsert_employee(
    user_id: str,
    body: EmployeeProfileUpsert,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)
    existing = _fetchone(conn,
        "SELECT profile_id FROM employee_profiles WHERE user_id = %s AND station_id = %s",
        (user_id, station_id))
    data = body.model_dump()
    try:
        if existing:
            sets = ", ".join(f"{k} = %s" for k in data)
            conn.execute(
                f"UPDATE employee_profiles SET {sets}, updated_at = NOW() "
                f"WHERE user_id = %s AND station_id = %s",
                (*data.values(), user_id, station_id))
            profile_id = existing["profile_id"]
        else:
            profile_id = _uid()
            cols = ", ".join(["profile_id", "user_id", "station_id"] + list(data.keys()))
            placeholders = ", ".join(["%s"] * (3 + len(data)))
            conn.execute(
                f"INSERT INTO employee_profiles ({cols}) VALUES ({placeholders})",
                (profile_id, user_id, station_id, *data.values()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn,
        "SELECT * FROM employee_profiles WHERE profile_id = %s", (profile_id,))
    return _str_dates(row)


@router.patch("/employees/{user_id}/toggle-active", response_model=EmployeeProfile)
def toggle_employee_active(
    user_id: str,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)
    row = _fetchone(conn,
        "SELECT * FROM employee_profiles WHERE user_id = %s AND station_id = %s",
        (user_id, station_id))
    if not row:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    # State machine:
    #   inactive               → reactivate immediately (is_active=TRUE, pending=FALSE)
    #   active, pending=FALSE  → queue deactivation (is_active stays TRUE, pending=TRUE)
    #   active, pending=TRUE   → cancel pending deactivation (pending=FALSE)
    if not row["is_active"]:
        new_active, new_pending = True, False
    elif not row["pending_deactivation"]:
        new_active, new_pending = True, True   # queued — still runs in next payroll
    else:
        new_active, new_pending = True, False  # cancel the queue

    try:
        conn.execute(
            "UPDATE employee_profiles SET is_active = %s, pending_deactivation = %s, updated_at = NOW() "
            "WHERE user_id = %s AND station_id = %s",
            (new_active, new_pending, user_id, station_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn,
        "SELECT * FROM employee_profiles WHERE user_id = %s AND station_id = %s",
        (user_id, station_id))
    return _str_dates(row)


# ══════════════════════════════════════════════════════════
# Statutory rates
# GET /payroll/rates
# GET /payroll/rates/active
# POST /payroll/rates
# ══════════════════════════════════════════════════════════

@router.get("/rates", response_model=List[StatutoryRates])
def list_rates(current_user: dict = Depends(require_owner)):
    _require_db()
    conn = _get_connection()
    rows = _fetchall(conn, "SELECT * FROM statutory_rates ORDER BY effective_from DESC")
    for r in rows:
        if isinstance(r.get("paye_bands"), str):
            r["paye_bands"] = json.loads(r["paye_bands"])
    return [_str_dates(r) for r in rows]


@router.get("/rates/active", response_model=StatutoryRates)
def get_active_rates(current_user: dict = Depends(require_owner)):
    _require_db()
    conn = _get_connection()
    return _str_dates(_active_rates(conn))


@router.post("/rates", response_model=StatutoryRates)
def create_rates(
    body: StatutoryRatesCreate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    rate_id = _uid()
    from psycopg.types.json import Jsonb
    bands = [b.model_dump() for b in body.paye_bands]
    try:
        conn.execute("""
            INSERT INTO statutory_rates (
                rate_id, paye_bands,
                napsa_employee_rate, napsa_employer_rate, napsa_monthly_ceiling,
                nhima_employee_rate, nhima_employer_rate,
                overtime_weekday_multiplier, overtime_weekend_multiplier,
                standard_hours_per_week, effective_from, created_by
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            rate_id, Jsonb(bands),
            body.napsa_employee_rate, body.napsa_employer_rate, body.napsa_monthly_ceiling,
            body.nhima_employee_rate, body.nhima_employer_rate,
            body.overtime_weekday_multiplier, body.overtime_weekend_multiplier,
            body.standard_hours_per_week, body.effective_from,
            current_user["user_id"],
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM statutory_rates WHERE rate_id = %s", (rate_id,))
    if isinstance(row.get("paye_bands"), str):
        row["paye_bands"] = json.loads(row["paye_bands"])
    return _str_dates(row)


# ══════════════════════════════════════════════════════════
# WCF categories
# GET /payroll/wcf-categories
# POST /payroll/wcf-categories
# PUT /payroll/wcf-categories/{category_id}
# ══════════════════════════════════════════════════════════

@router.get("/wcf-categories", response_model=List[WcfCategory])
def list_wcf_categories(current_user: dict = Depends(require_owner)):
    _require_db()
    conn = _get_connection()
    rows = _fetchall(conn, "SELECT * FROM wcf_categories ORDER BY category_name")
    return [_str_dates(r) for r in rows]


@router.post("/wcf-categories", response_model=WcfCategory)
def create_wcf_category(
    body: WcfCategoryCreate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    cat_id = _uid()
    try:
        conn.execute("""
            INSERT INTO wcf_categories (category_id,category_name,rate_percent,description,effective_from)
            VALUES (%s,%s,%s,%s,%s)
        """, (cat_id, body.category_name, body.rate_percent, body.description, body.effective_from))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM wcf_categories WHERE category_id = %s", (cat_id,))
    return _str_dates(row)


@router.put("/wcf-categories/{category_id}", response_model=WcfCategory)
def update_wcf_category(
    category_id: str,
    body: WcfCategoryUpdate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets = ", ".join(f"{k} = %s" for k in data)
    try:
        conn.execute(
            f"UPDATE wcf_categories SET {sets} WHERE category_id = %s",
            (*data.values(), category_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM wcf_categories WHERE category_id = %s", (category_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    return _str_dates(row)


# ══════════════════════════════════════════════════════════
# Leave types
# GET /payroll/leave-types
# POST /payroll/leave-types
# PUT /payroll/leave-types/{type_id}
# ══════════════════════════════════════════════════════════

@router.get("/leave-types", response_model=List[LeaveType])
def list_leave_types(current_user: dict = Depends(require_owner)):
    _require_db()
    conn = _get_connection()
    return _fetchall(conn, "SELECT * FROM leave_types ORDER BY type_name")


@router.post("/leave-types", response_model=LeaveType)
def create_leave_type(
    body: LeaveTypeCreate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    type_id = _uid()
    try:
        conn.execute("""
            INSERT INTO leave_types
                (type_id,type_name,days_per_year,full_pay_days,half_pay_days,requires_documentation)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (type_id, body.type_name, body.days_per_year,
              body.full_pay_days, body.half_pay_days, body.requires_documentation))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return _fetchone(conn, "SELECT * FROM leave_types WHERE type_id = %s", (type_id,))


@router.put("/leave-types/{type_id}", response_model=LeaveType)
def update_leave_type(
    type_id: str,
    body: LeaveTypeUpdate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    row = _fetchone(conn, "SELECT is_system FROM leave_types WHERE type_id = %s", (type_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Leave type not found")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets = ", ".join(f"{k} = %s" for k in data)
    try:
        conn.execute(
            f"UPDATE leave_types SET {sets} WHERE type_id = %s",
            (*data.values(), type_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return _fetchone(conn, "SELECT * FROM leave_types WHERE type_id = %s", (type_id,))


# ══════════════════════════════════════════════════════════
# Leave balances
# GET /payroll/leave-balances
# GET /payroll/leave-balances/{user_id}
# ══════════════════════════════════════════════════════════

def _ensure_balances(conn, user_id: str, year: int):
    """Create missing leave_balance rows for all leave types for a user/year."""
    types = _fetchall(conn, "SELECT type_id, days_per_year FROM leave_types")
    for lt in types:
        existing = _fetchone(conn,
            "SELECT balance_id FROM leave_balances WHERE user_id=%s AND leave_type_id=%s AND year=%s",
            (user_id, lt["type_id"], year))
        if not existing:
            entitled = float(lt["days_per_year"]) if lt["days_per_year"] else 0.0
            conn.execute("""
                INSERT INTO leave_balances (balance_id,user_id,leave_type_id,year,days_entitled)
                VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
            """, (_uid(), user_id, lt["type_id"], year, entitled))


@router.get("/leave-balances", response_model=List[LeaveBalance])
def list_leave_balances(
    year: int = Query(default=None),
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    if year is None:
        year = datetime.utcnow().year
    rows = _fetchall(conn, """
        SELECT lb.*,
               (lb.days_entitled + lb.carry_forward - lb.days_taken) AS days_remaining
        FROM leave_balances lb
        JOIN employee_profiles ep ON ep.user_id = lb.user_id
        WHERE ep.station_id = %s AND lb.year = %s
    """, (_station_id(ctx), year))
    return rows


@router.get("/leave-balances/{user_id}", response_model=List[LeaveBalance])
def get_leave_balance(
    user_id: str,
    year: int = Query(default=None),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    if year is None:
        year = datetime.utcnow().year
    _ensure_balances(conn, user_id, year)
    conn.commit()
    rows = _fetchall(conn, """
        SELECT *, (days_entitled + carry_forward - days_taken) AS days_remaining
        FROM leave_balances WHERE user_id = %s AND year = %s
    """, (user_id, year))
    return rows


# ══════════════════════════════════════════════════════════
# Leave requests
# GET /payroll/leave-requests
# POST /payroll/leave-requests
# PUT /payroll/leave-requests/{request_id}/approve
# PUT /payroll/leave-requests/{request_id}/reject
# PUT /payroll/leave-requests/{request_id}/cancel
# ══════════════════════════════════════════════════════════

@router.get("/leave-requests", response_model=List[LeaveRequest])
def list_leave_requests(
    status: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    sql = """
        SELECT lr.* FROM leave_requests lr
        JOIN employee_profiles ep ON ep.user_id = lr.user_id
        WHERE ep.station_id = %s
    """
    params: list = [_station_id(ctx)]
    if status:
        sql += " AND lr.status = %s"
        params.append(status)
    if user_id:
        sql += " AND lr.user_id = %s"
        params.append(user_id)
    sql += " ORDER BY lr.created_at DESC"
    rows = _fetchall(conn, sql, tuple(params))
    return [_str_dates(r) for r in rows]


@router.post("/leave-requests", response_model=LeaveRequest)
def create_leave_request(
    body: LeaveRequestCreate,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(get_current_user),
):
    _require_db()
    conn = _get_connection()
    req_id = _uid()
    try:
        conn.execute("""
            INSERT INTO leave_requests
                (request_id,user_id,leave_type_id,start_date,end_date,days_requested,notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
        """, (req_id, current_user["user_id"], body.leave_type_id,
              body.start_date, body.end_date, body.days_requested, body.notes))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM leave_requests WHERE request_id = %s", (req_id,))
    return _str_dates(row)


def _update_leave_request_status(conn, request_id: str, new_status: str,
                                  approver_id: str, manager_notes: Optional[str]):
    row = _fetchone(conn, "SELECT * FROM leave_requests WHERE request_id = %s", (request_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {row['status']}")
    try:
        conn.execute("""
            UPDATE leave_requests
            SET status=%s, approved_by=%s, manager_notes=%s,
                approved_at=NOW(), updated_at=NOW()
            WHERE request_id=%s
        """, (new_status, approver_id, manager_notes, request_id))
        if new_status == "approved":
            conn.execute("""
                UPDATE leave_balances SET days_taken = days_taken + %s, updated_at = NOW()
                WHERE user_id=%s AND leave_type_id=%s AND year=%s
            """, (row["days_requested"], row["user_id"], row["leave_type_id"],
                  date.fromisoformat(str(row["start_date"])).year))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    updated = _fetchone(conn, "SELECT * FROM leave_requests WHERE request_id = %s", (request_id,))
    return _str_dates(updated)


@router.put("/leave-requests/{request_id}/approve", response_model=LeaveRequest)
def approve_leave_request(
    request_id: str,
    body: LeaveRequestAction = LeaveRequestAction(),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    return _update_leave_request_status(
        conn, request_id, "approved", current_user["user_id"], body.manager_notes)


@router.put("/leave-requests/{request_id}/reject", response_model=LeaveRequest)
def reject_leave_request(
    request_id: str,
    body: LeaveRequestAction = LeaveRequestAction(),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    return _update_leave_request_status(
        conn, request_id, "rejected", current_user["user_id"], body.manager_notes)


@router.put("/leave-requests/{request_id}/cancel", response_model=LeaveRequest)
def cancel_leave_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_db()
    conn = _get_connection()
    row = _fetchone(conn, "SELECT * FROM leave_requests WHERE request_id = %s", (request_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row["user_id"] != current_user["user_id"] and current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Not authorized to cancel this request")
    if row["status"] not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Cannot cancel a request with status '{row['status']}'")
    try:
        conn.execute(
            "UPDATE leave_requests SET status='cancelled', updated_at=NOW() WHERE request_id=%s",
            (request_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    updated = _fetchone(conn, "SELECT * FROM leave_requests WHERE request_id = %s", (request_id,))
    return _str_dates(updated)


# ══════════════════════════════════════════════════════════
# Attendance
# GET /payroll/attendance
# PUT /payroll/attendance/{user_id}/{date}
# POST /payroll/attendance/bulk
# ══════════════════════════════════════════════════════════

@router.get("/attendance", response_model=List[AttendanceRecord])
def get_attendance(
    month: int = Query(...),
    year: int = Query(...),
    user_id: Optional[str] = Query(default=None),
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    sql = """
        SELECT ar.* FROM attendance_records ar
        JOIN employee_profiles ep ON ep.user_id = ar.user_id
        WHERE ep.station_id = %s
          AND EXTRACT(MONTH FROM ar.work_date) = %s
          AND EXTRACT(YEAR  FROM ar.work_date) = %s
    """
    params: list = [_station_id(ctx), month, year]
    if user_id:
        sql += " AND ar.user_id = %s"
        params.append(user_id)
    sql += " ORDER BY ar.work_date, ar.user_id"
    rows = _fetchall(conn, sql, tuple(params))
    return [_str_dates(r) for r in rows]


@router.put("/attendance/{user_id}/{work_date}", response_model=AttendanceRecord)
def upsert_attendance(
    user_id: str,
    work_date: str,
    body: AttendanceUpsert,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)
    existing = _fetchone(conn,
        "SELECT record_id FROM attendance_records WHERE user_id=%s AND work_date=%s",
        (user_id, work_date))
    data = body.model_dump()
    try:
        if existing:
            sets = ", ".join(f"{k} = %s" for k in data)
            conn.execute(
                f"UPDATE attendance_records SET {sets} WHERE user_id=%s AND work_date=%s",
                (*data.values(), user_id, work_date))
            record_id = existing["record_id"]
        else:
            record_id = _uid()
            conn.execute("""
                INSERT INTO attendance_records
                    (record_id,user_id,station_id,work_date,status,regular_hours,
                     overtime_hours,overtime_type,leave_request_id,notes,recorded_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (record_id, user_id, station_id, work_date,
                  data["status"], data["regular_hours"], data["overtime_hours"],
                  data["overtime_type"], data.get("leave_request_id"),
                  data.get("notes"), current_user["user_id"]))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM attendance_records WHERE record_id=%s", (record_id,))
    return _str_dates(row)


@router.post("/attendance/bulk")
def bulk_upsert_attendance(
    body: AttendanceBulkUpsert,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)
    saved = 0
    try:
        for entry in body.records:
            existing = _fetchone(conn,
                "SELECT record_id FROM attendance_records WHERE user_id=%s AND work_date=%s",
                (entry.user_id, entry.work_date))
            if existing:
                conn.execute("""
                    UPDATE attendance_records
                    SET status=%s,regular_hours=%s,overtime_hours=%s,
                        overtime_type=%s,leave_request_id=%s,notes=%s
                    WHERE user_id=%s AND work_date=%s
                """, (entry.status, entry.regular_hours, entry.overtime_hours,
                      entry.overtime_type, entry.leave_request_id, entry.notes,
                      entry.user_id, entry.work_date))
            else:
                conn.execute("""
                    INSERT INTO attendance_records
                        (record_id,user_id,station_id,work_date,status,regular_hours,
                         overtime_hours,overtime_type,leave_request_id,notes,recorded_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (_uid(), entry.user_id, station_id, entry.work_date,
                      entry.status, entry.regular_hours, entry.overtime_hours,
                      entry.overtime_type, entry.leave_request_id, entry.notes,
                      current_user["user_id"]))
            saved += 1
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {"saved": saved}


# ══════════════════════════════════════════════════════════
# Public holidays
# GET /payroll/public-holidays
# POST /payroll/public-holidays
# DELETE /payroll/public-holidays/{holiday_id}
# ══════════════════════════════════════════════════════════

@router.get("/public-holidays", response_model=List[PublicHoliday])
def list_public_holidays(
    year: int = Query(default=None),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    if year is None:
        year = datetime.utcnow().year
    rows = _fetchall(conn,
        "SELECT * FROM public_holidays WHERE EXTRACT(YEAR FROM holiday_date) = %s ORDER BY holiday_date",
        (year,))
    return [_str_dates(r) for r in rows]


@router.post("/public-holidays", response_model=PublicHoliday)
def create_public_holiday(
    body: PublicHolidayCreate,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    hid = _uid()
    try:
        conn.execute("""
            INSERT INTO public_holidays
                (holiday_id,holiday_name,holiday_date,is_recurring,
                 recurrence_month,recurrence_day,notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
        """, (hid, body.holiday_name, body.holiday_date, body.is_recurring,
              body.recurrence_month, body.recurrence_day, body.notes))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM public_holidays WHERE holiday_id = %s", (hid,))
    return _str_dates(row)


@router.delete("/public-holidays/{holiday_id}")
def delete_public_holiday(
    holiday_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM public_holidays WHERE holiday_id = %s", (holiday_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {"deleted": holiday_id}


# ══════════════════════════════════════════════════════════
# Salary advances
# GET /payroll/advances
# GET /payroll/advances/{advance_id}
# POST /payroll/advances
# PUT /payroll/advances/{advance_id}/approve
# PUT /payroll/advances/{advance_id}/reject
# ══════════════════════════════════════════════════════════

@router.get("/advances", response_model=List[SalaryAdvance])
def list_advances(
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    rows = _fetchall(conn,
        "SELECT * FROM salary_advances WHERE station_id = %s ORDER BY created_at DESC",
        (_station_id(ctx),))
    return [_str_dates(r) for r in rows]


@router.get("/advances/{advance_id}", response_model=SalaryAdvance)
def get_advance(
    advance_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    row = _fetchone(conn, "SELECT * FROM salary_advances WHERE advance_id = %s", (advance_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Advance not found")
    return _str_dates(row)


@router.post("/advances", response_model=SalaryAdvance)
def create_advance(
    body: SalaryAdvanceCreate,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    adv_id = _uid()
    monthly = round(body.amount / body.repayment_months, 2)
    try:
        conn.execute("""
            INSERT INTO salary_advances
                (advance_id,user_id,station_id,amount,reason,
                 repayment_months,monthly_deduction,outstanding_balance,status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'pending')
        """, (adv_id, body.user_id, _station_id(ctx),
              body.amount, body.reason, body.repayment_months, monthly, body.amount))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    row = _fetchone(conn, "SELECT * FROM salary_advances WHERE advance_id = %s", (adv_id,))
    return _str_dates(row)


def _set_advance_status(conn, advance_id: str, new_status: str, approver_id: str) -> dict:
    row = _fetchone(conn, "SELECT * FROM salary_advances WHERE advance_id = %s", (advance_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Advance not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Advance is already {row['status']}")
    date_issued = date.today().isoformat() if new_status == "approved" else None
    active_status = "active" if new_status == "approved" else new_status
    try:
        conn.execute("""
            UPDATE salary_advances
            SET status=%s, approved_by=%s, date_issued=%s, updated_at=NOW()
            WHERE advance_id=%s
        """, (active_status, approver_id, date_issued, advance_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    updated = _fetchone(conn, "SELECT * FROM salary_advances WHERE advance_id = %s", (advance_id,))
    return _str_dates(updated)


@router.put("/advances/{advance_id}/approve", response_model=SalaryAdvance)
def approve_advance(
    advance_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    return _set_advance_status(conn, advance_id, "approved", current_user["user_id"])


@router.put("/advances/{advance_id}/reject", response_model=SalaryAdvance)
def reject_advance(
    advance_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    return _set_advance_status(conn, advance_id, "rejected", current_user["user_id"])


# ══════════════════════════════════════════════════════════
# Payroll runs
# GET /payroll/runs
# POST /payroll/runs
# GET /payroll/runs/{run_id}
# PUT /payroll/runs/{run_id}/approve
# GET /payroll/runs/{run_id}/payslips
# ══════════════════════════════════════════════════════════

@router.get("/runs", response_model=List[PayrollRun])
def list_runs(
    year: Optional[int] = Query(default=None),
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    sql = "SELECT * FROM payroll_runs WHERE station_id = %s"
    params: list = [_station_id(ctx)]
    if year:
        sql += " AND period_year = %s"
        params.append(year)
    sql += " ORDER BY period_year DESC, period_month DESC"
    rows = _fetchall(conn, sql, tuple(params))
    return [_str_dates(r) for r in rows]


@router.post("/runs", response_model=PayrollRunDetail)
def create_run(
    body: PayrollRunCreate,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)

    existing = _fetchone(conn,
        "SELECT run_id FROM payroll_runs WHERE station_id=%s AND period_month=%s AND period_year=%s",
        (station_id, body.period_month, body.period_year))
    if existing:
        raise HTTPException(status_code=409,
            detail=f"Payroll run for {body.period_month}/{body.period_year} already exists")

    rates = _active_rates(conn)
    profiles = _fetchall(conn,
        "SELECT * FROM employee_profiles WHERE station_id=%s AND is_active=TRUE", (station_id,))
    if not profiles:
        raise HTTPException(status_code=400, detail="No active employee profiles for this station")

    run_id = _uid()
    payslip_rows = []

    for profile in profiles:
        uid = profile["user_id"]
        wcf_rate = _wcf_rate(conn, profile.get("wcf_category_id"))

        ot_entries = _fetchall(conn, """
            SELECT work_date, overtime_hours, overtime_type
            FROM attendance_records
            WHERE user_id=%s
              AND EXTRACT(MONTH FROM work_date)=%s
              AND EXTRACT(YEAR  FROM work_date)=%s
              AND overtime_hours > 0
        """, (uid, body.period_month, body.period_year))

        active_advances = _fetchall(conn,
            "SELECT monthly_deduction, outstanding_balance FROM salary_advances "
            "WHERE user_id=%s AND status='active'", (uid,))

        att_summary = _fetchone(conn, """
            SELECT COUNT(*) as days,
                   SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) as leave_days
            FROM attendance_records
            WHERE user_id=%s
              AND EXTRACT(MONTH FROM work_date)=%s
              AND EXTRACT(YEAR  FROM work_date)=%s
        """, (uid, body.period_month, body.period_year))

        calc = calculate_payslip(
            profile=profile,
            rates=rates,
            wcf_rate=wcf_rate,
            overtime_entries=ot_entries,
            active_advances=active_advances,
            attendance_days=int(att_summary["days"]) if att_summary and att_summary["days"] else None,
            leave_days_taken=float(att_summary["leave_days"]) if att_summary and att_summary["leave_days"] else None,
        )

        payslip_id = _uid()
        from psycopg.types.json import Jsonb
        conn.execute("""
            INSERT INTO payslips (
                payslip_id,run_id,user_id,station_id,
                basic_salary,housing_allowance,transport_allowance,other_allowances,
                overtime_pay,overtime_details,gross_salary,
                napsa_employee_calc,nhima_employee_calc,paye_calc,
                napsa_employee_override,nhima_employee_override,paye_override,
                custom_deductions,advances_deducted,
                total_deductions,net_pay,
                napsa_employer,nhima_employer,wcf_employer,total_employer_cost,
                attendance_days,leave_days_taken
            ) VALUES (
                %s,%s,%s,%s,
                %s,%s,%s,%s,
                %s,%s,%s,
                %s,%s,%s,
                %s,%s,%s,
                %s,%s,
                %s,%s,
                %s,%s,%s,%s,
                %s,%s
            )
        """, (
            payslip_id, run_id, uid, station_id,
            calc["basic_salary"], calc["housing_allowance"],
            calc["transport_allowance"], calc["other_allowances"],
            calc["overtime_pay"], Jsonb(calc["overtime_details"]), calc["gross_salary"],
            calc["napsa_employee_calc"], calc["nhima_employee_calc"], calc["paye_calc"],
            None, None, None,
            Jsonb([]), calc["advances_deducted"],
            calc["total_deductions"], calc["net_pay"],
            calc["napsa_employer"], calc["nhima_employer"],
            calc["wcf_employer"], calc["total_employer_cost"],
            calc["attendance_days"], calc["leave_days_taken"],
        ))

        payslip_rows.append({**calc, "payslip_id": payslip_id, "run_id": run_id,
                              "user_id": uid, "station_id": station_id, "is_historical": False})

        # Deduct advance repayments
        if calc["advances_deducted"] > 0:
            for adv in active_advances:
                deduction = min(float(adv["monthly_deduction"]), float(adv["outstanding_balance"]))
                if deduction <= 0:
                    continue
                adv_row = _fetchone(conn,
                    "SELECT advance_id FROM salary_advances "
                    "WHERE user_id=%s AND status='active' AND outstanding_balance>0 LIMIT 1",
                    (uid,))
                if adv_row:
                    new_balance = max(0, float(adv["outstanding_balance"]) - deduction)
                    new_status = "settled" if new_balance == 0 else "active"
                    conn.execute("""
                        UPDATE salary_advances
                        SET outstanding_balance=%s, status=%s, updated_at=NOW()
                        WHERE advance_id=%s
                    """, (new_balance, new_status, adv_row["advance_id"]))
                    conn.execute("""
                        INSERT INTO advance_repayments
                            (repayment_id,advance_id,payslip_id,amount,repayment_date)
                        VALUES (%s,%s,%s,%s,%s)
                    """, (_uid(), adv_row["advance_id"], payslip_id,
                          deduction, date.today().isoformat()))

    totals = aggregate_run_totals(payslip_rows)
    conn.execute("""
        INSERT INTO payroll_runs (
            run_id,station_id,period_month,period_year,status,
            total_gross,total_basic,total_allowances,total_overtime,
            total_paye,total_napsa_employee,total_napsa_employer,
            total_nhima_employee,total_nhima_employer,total_wcf_employer,
            total_advances,total_net,total_employer_cost,
            statutory_rate_id,created_by
        ) VALUES (
            %s,%s,%s,%s,'draft',
            %s,%s,%s,%s,
            %s,%s,%s,
            %s,%s,%s,
            %s,%s,%s,
            %s,%s
        )
    """, (
        run_id, station_id, body.period_month, body.period_year,
        totals["total_gross"], totals["total_basic"], totals["total_allowances"],
        totals["total_overtime"], totals["total_paye"],
        totals["total_napsa_employee"], totals["total_napsa_employer"],
        totals["total_nhima_employee"], totals["total_nhima_employer"],
        totals["total_wcf_employer"], totals["total_advances"],
        totals["total_net"], totals["total_employer_cost"],
        rates["rate_id"], current_user["user_id"],
    ))
    conn.commit()

    # Employees queued for deactivation are now paid — apply it.
    conn.execute(
        "UPDATE employee_profiles SET is_active = FALSE, pending_deactivation = FALSE, updated_at = NOW() "
        "WHERE station_id = %s AND pending_deactivation = TRUE",
        (station_id,))
    conn.commit()

    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    slips = _fetchall(conn, "SELECT * FROM payslips WHERE run_id = %s ORDER BY user_id", (run_id,))
    return {**_str_dates(run), "payslips": [_str_dates(s) for s in slips]}


@router.get("/runs/{run_id}", response_model=PayrollRunDetail)
def get_run(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    slips = _fetchall(conn, "SELECT * FROM payslips WHERE run_id = %s ORDER BY user_id", (run_id,))
    return {**_str_dates(run), "payslips": [_str_dates(s) for s in slips]}


@router.put("/runs/{run_id}/approve", response_model=PayrollRun)
def approve_run(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run["status"] != "draft":
        raise HTTPException(status_code=400, detail=f"Run is already {run['status']}")
    try:
        conn.execute("""
            UPDATE payroll_runs
            SET status='approved', approved_by=%s, approved_at=NOW()
            WHERE run_id=%s
        """, (current_user["user_id"], run_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    updated = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    return _str_dates(updated)


@router.get("/runs/{run_id}/payslips", response_model=List[Payslip])
def get_run_payslips(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    slips = _fetchall(conn,
        "SELECT * FROM payslips WHERE run_id = %s ORDER BY user_id", (run_id,))
    return [_str_dates(s) for s in slips]


@router.get("/runs/{run_id}/print-data")
def get_run_print_data(
    run_id: str,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    """All data needed to render print-ready payslips for a run."""
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)

    run = _fetchone(conn,
        "SELECT * FROM payroll_runs WHERE run_id = %s AND station_id = %s",
        (run_id, station_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    rows = _fetchall(conn, """
        SELECT ps.*,
               u.full_name,
               ep.tpin, ep.nrc_number, ep.napsa_number, ep.nhima_number,
               ep.bank_name, ep.bank_branch, ep.bank_account_number,
               ep.mobile_money_provider, ep.mobile_money_number,
               ep.preferred_payment_method
        FROM payslips ps
        JOIN users u ON u.user_id = ps.user_id
        LEFT JOIN employee_profiles ep
               ON ep.user_id = ps.user_id AND ep.station_id = %s
        WHERE ps.run_id = %s
        ORDER BY u.full_name
    """, (station_id, run_id))

    for r in rows:
        _str_dates(r)
        if isinstance(r.get("custom_deductions"), str):
            r["custom_deductions"] = json.loads(r["custom_deductions"])
        if isinstance(r.get("overtime_details"), str):
            r["overtime_details"] = json.loads(r["overtime_details"])

    sys_settings = ctx["storage"].get("system_settings", {})
    business_info = {
        "business_name": sys_settings.get("business_name", ""),
        "station_location": sys_settings.get("station_location", ""),
        "contact_phone": sys_settings.get("contact_phone", ""),
        "contact_email": sys_settings.get("contact_email", ""),
    }

    return {
        "business_info": business_info,
        "run": _str_dates(run),
        "payslips": rows,
    }


# ══════════════════════════════════════════════════════════
# Payslips
# GET /payroll/payslips/{payslip_id}
# PATCH /payroll/payslips/{payslip_id}/overrides
# ══════════════════════════════════════════════════════════

@router.get("/payslips/{payslip_id}", response_model=Payslip)
def get_payslip(
    payslip_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    row = _fetchone(conn, "SELECT * FROM payslips WHERE payslip_id = %s", (payslip_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return _str_dates(row)


@router.patch("/payslips/{payslip_id}/overrides", response_model=Payslip)
def apply_overrides(
    payslip_id: str,
    body: PayslipOverrides,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    slip = _fetchone(conn,
        "SELECT ps.*, pr.status as run_status FROM payslips ps "
        "JOIN payroll_runs pr ON pr.run_id = ps.run_id "
        "WHERE ps.payslip_id = %s", (payslip_id,))
    if not slip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    if slip["run_status"] != "draft":
        raise HTTPException(status_code=400, detail="Cannot edit overrides on an approved run")

    updates: dict = {}
    if body.napsa_employee_override is not None:
        updates["napsa_employee_override"] = body.napsa_employee_override
    elif "napsa_employee_override" in body.model_fields_set:
        updates["napsa_employee_override"] = None

    if body.nhima_employee_override is not None:
        updates["nhima_employee_override"] = body.nhima_employee_override
    elif "nhima_employee_override" in body.model_fields_set:
        updates["nhima_employee_override"] = None

    if body.paye_override is not None:
        updates["paye_override"] = body.paye_override
    elif "paye_override" in body.model_fields_set:
        updates["paye_override"] = None

    if body.custom_deductions is not None:
        updates["custom_deductions"] = [d.model_dump() for d in body.custom_deductions]

    if body.notes is not None:
        updates["notes"] = body.notes

    merged = {**slip, **updates}
    if isinstance(merged.get("custom_deductions"), str):
        merged["custom_deductions"] = json.loads(merged["custom_deductions"])
    recomputed = recompute_totals(merged)

    from psycopg.types.json import Jsonb
    try:
        conn.execute("""
            UPDATE payslips SET
                napsa_employee_override=%s,
                nhima_employee_override=%s,
                paye_override=%s,
                custom_deductions=%s,
                notes=%s,
                total_deductions=%s,
                net_pay=%s,
                updated_at=NOW()
            WHERE payslip_id=%s
        """, (
            recomputed.get("napsa_employee_override"),
            recomputed.get("nhima_employee_override"),
            recomputed.get("paye_override"),
            Jsonb(recomputed.get("custom_deductions") or []),
            recomputed.get("notes"),
            recomputed["total_deductions"],
            recomputed["net_pay"],
            payslip_id,
        ))
        # Refresh run totals
        slips = _fetchall(conn,
            "SELECT * FROM payslips WHERE run_id = %s", (slip["run_id"],))
        for s in slips:
            if isinstance(s.get("custom_deductions"), str):
                s["custom_deductions"] = json.loads(s["custom_deductions"])
        new_totals = aggregate_run_totals(slips)
        sets = ", ".join(f"{k}=%s" for k in new_totals)
        conn.execute(
            f"UPDATE payroll_runs SET {sets} WHERE run_id=%s",
            (*new_totals.values(), slip["run_id"]))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    updated = _fetchone(conn, "SELECT * FROM payslips WHERE payslip_id = %s", (payslip_id,))
    return _str_dates(updated)


# ══════════════════════════════════════════════════════════
# Payments
# GET /payroll/runs/{run_id}/payments
# GET /payroll/runs/{run_id}/payment-file
# PUT /payroll/runs/{run_id}/mark-paid
# ══════════════════════════════════════════════════════════

@router.get("/runs/{run_id}/payments", response_model=List[PayrollPayment])
def get_payments(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    rows = _fetchall(conn,
        "SELECT * FROM payroll_payments WHERE run_id = %s ORDER BY created_at",
        (run_id,))
    return [_str_dates(r) for r in rows]


@router.get("/runs/{run_id}/payment-file")
def download_payment_file(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run["status"] == "draft":
        raise HTTPException(status_code=400, detail="Approve the run before downloading the payment file")

    rows = _fetchall(conn, """
        SELECT ps.payslip_id, ps.user_id, ps.net_pay,
               u.full_name,
               ep.bank_name, ep.bank_branch, ep.bank_account_number,
               ep.mobile_money_provider, ep.mobile_money_number,
               ep.preferred_payment_method, ep.nrc_number
        FROM payslips ps
        JOIN users u ON u.user_id = ps.user_id
        LEFT JOIN employee_profiles ep ON ep.user_id = ps.user_id AND ep.station_id = %s
        WHERE ps.run_id = %s
        ORDER BY u.full_name
    """, (run["station_id"], run_id))

    period = f"{run['period_year']}{str(run['period_month']).zfill(2)}"
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee Name", "Payment Method", "Bank", "Branch",
        "Account Number", "Mobile Money Provider", "Mobile Money Number",
        "Amount (ZMW)", "Reference", "NRC"
    ])
    for r in rows:
        ref = f"PAY-{run['station_id']}-{period}-{r['user_id'][:6].upper()}"
        writer.writerow([
            r["full_name"],
            r["preferred_payment_method"] or "bank",
            r["bank_name"] or "",
            r["bank_branch"] or "",
            r["bank_account_number"] or "",
            r["mobile_money_provider"] or "",
            r["mobile_money_number"] or "",
            f"{r['net_pay']:.2f}",
            ref,
            r["nrc_number"] or "",
        ])

    output.seek(0)
    filename = f"payroll_{run['station_id']}_{period}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.put("/runs/{run_id}/mark-paid", response_model=PayrollRun)
def mark_paid(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run["status"] != "approved":
        raise HTTPException(status_code=400, detail="Run must be approved before marking as paid")
    try:
        conn.execute(
            "UPDATE payroll_runs SET status='paid' WHERE run_id=%s", (run_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    updated = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    return _str_dates(updated)


# ══════════════════════════════════════════════════════════
# Statutory reports
# GET /payroll/runs/{run_id}/statutory
# GET /payroll/statutory/ytd
# ══════════════════════════════════════════════════════════

@router.get("/runs/{run_id}/statutory")
def get_statutory_report(
    run_id: str,
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    slips = _fetchall(conn, """
        SELECT ps.*, u.full_name, ep.tpin, ep.napsa_number, ep.nhima_number
        FROM payslips ps
        JOIN users u ON u.user_id = ps.user_id
        LEFT JOIN employee_profiles ep ON ep.user_id = ps.user_id AND ep.station_id = %s
        WHERE ps.run_id = %s ORDER BY u.full_name
    """, (run["station_id"], run_id))

    paye_lines = [{"user_id": s["user_id"], "name": s["full_name"], "tpin": s.get("tpin"),
                   "gross": float(s["gross_salary"]),
                   "taxable": float(s["gross_salary"]) - float(s.get("napsa_employee_override") or s.get("napsa_employee_calc", 0)),
                   "paye": float(s.get("paye_override") or s.get("paye_calc", 0))} for s in slips]
    napsa_lines = [{"user_id": s["user_id"], "name": s["full_name"], "napsa_number": s.get("napsa_number"),
                    "gross": float(s["gross_salary"]),
                    "employee": float(s.get("napsa_employee_override") or s.get("napsa_employee_calc", 0)),
                    "employer": float(s["napsa_employer"]),
                    "total": float(s.get("napsa_employee_override") or s.get("napsa_employee_calc", 0)) + float(s["napsa_employer"])} for s in slips]
    nhima_lines = [{"user_id": s["user_id"], "name": s["full_name"], "nhima_number": s.get("nhima_number"),
                    "gross": float(s["gross_salary"]),
                    "employee": float(s.get("nhima_employee_override") or s.get("nhima_employee_calc", 0)),
                    "employer": float(s["nhima_employer"]),
                    "total": float(s.get("nhima_employee_override") or s.get("nhima_employee_calc", 0)) + float(s["nhima_employer"])} for s in slips]
    wcf_lines = [{"user_id": s["user_id"], "name": s["full_name"],
                  "gross": float(s["gross_salary"]),
                  "wcf_employer": float(s["wcf_employer"])} for s in slips]

    return {
        "run_id": run_id,
        "period_month": run["period_month"],
        "period_year": run["period_year"],
        "station_id": run["station_id"],
        "paye": {"lines": paye_lines, "total": float(run["total_paye"])},
        "napsa": {
            "lines": napsa_lines,
            "total_employee": float(run["total_napsa_employee"]),
            "total_employer": float(run["total_napsa_employer"]),
            "total": float(run["total_napsa_employee"]) + float(run["total_napsa_employer"]),
        },
        "nhima": {
            "lines": nhima_lines,
            "total_employee": float(run["total_nhima_employee"]),
            "total_employer": float(run["total_nhima_employer"]),
            "total": float(run["total_nhima_employee"]) + float(run["total_nhima_employer"]),
        },
        "wcf": {"lines": wcf_lines, "total_employer": float(run["total_wcf_employer"])},
        "net_payroll": float(run["total_net"]),
        "total_employer_cost": float(run["total_employer_cost"]),
    }


@router.get("/statutory/ytd")
def get_ytd_statutory(
    year: int = Query(...),
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)
    rows = _fetchall(conn, """
        SELECT period_month,
               total_paye, total_napsa_employee, total_napsa_employer,
               total_nhima_employee, total_nhima_employer, total_wcf_employer,
               total_net, total_employer_cost, status
        FROM payroll_runs
        WHERE station_id=%s AND period_year=%s
        ORDER BY period_month
    """, (station_id, year))

    def _s(field): return sum(float(r[field]) for r in rows)
    return {
        "year": year,
        "station_id": station_id,
        "months": [_str_dates(r) for r in rows],
        "ytd_paye": _s("total_paye"),
        "ytd_napsa_employee": _s("total_napsa_employee"),
        "ytd_napsa_employer": _s("total_napsa_employer"),
        "ytd_nhima_employee": _s("total_nhima_employee"),
        "ytd_nhima_employer": _s("total_nhima_employer"),
        "ytd_wcf_employer": _s("total_wcf_employer"),
        "ytd_net": _s("total_net"),
        "ytd_employer_cost": _s("total_employer_cost"),
    }


# ══════════════════════════════════════════════════════════
# Historical import
# POST /payroll/history/import
# ══════════════════════════════════════════════════════════

@router.post("/history/import", response_model=PayrollRun)
def import_historical(
    body: HistoricalImport,
    ctx: dict = Depends(get_station_context),
    current_user: dict = Depends(require_owner),
):
    _require_db()
    conn = _get_connection()
    station_id = _station_id(ctx)

    existing = _fetchone(conn,
        "SELECT run_id FROM payroll_runs WHERE station_id=%s AND period_month=%s AND period_year=%s",
        (station_id, body.period_month, body.period_year))
    if existing:
        raise HTTPException(status_code=409,
            detail=f"A run for {body.period_month}/{body.period_year} already exists")

    run_id = _uid()
    payslip_rows = []
    try:
        for row in body.payslips:
            payslip_id = _uid()
            conn.execute("""
                INSERT INTO payslips (
                    payslip_id,run_id,user_id,station_id,is_historical,
                    basic_salary,housing_allowance,transport_allowance,
                    gross_salary,napsa_employee_calc,nhima_employee_calc,paye_calc,
                    total_deductions,net_pay
                ) VALUES (%s,%s,%s,%s,TRUE,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                payslip_id, run_id, row.user_id, station_id,
                row.basic_salary, row.housing_allowance, row.transport_allowance,
                row.gross_salary, row.napsa_employee, row.nhima_employee, row.paye,
                round(row.napsa_employee + row.nhima_employee + row.paye, 2),
                row.net_pay,
            ))
            payslip_rows.append({
                "gross_salary": row.gross_salary,
                "basic_salary": row.basic_salary,
                "housing_allowance": row.housing_allowance,
                "transport_allowance": row.transport_allowance,
                "other_allowances": 0,
                "overtime_pay": 0,
                "paye_calc": row.paye, "paye_override": None,
                "napsa_employee_calc": row.napsa_employee, "napsa_employee_override": None,
                "napsa_employer": 0,
                "nhima_employee_calc": row.nhima_employee, "nhima_employee_override": None,
                "nhima_employer": 0,
                "wcf_employer": 0,
                "advances_deducted": 0,
                "net_pay": row.net_pay,
                "total_employer_cost": row.gross_salary,
                "custom_deductions": [],
            })

        totals = aggregate_run_totals(payslip_rows)
        conn.execute("""
            INSERT INTO payroll_runs (
                run_id,station_id,period_month,period_year,status,is_historical,
                total_gross,total_basic,total_allowances,total_overtime,
                total_paye,total_napsa_employee,total_napsa_employer,
                total_nhima_employee,total_nhima_employer,total_wcf_employer,
                total_advances,total_net,total_employer_cost,created_by
            ) VALUES (%s,%s,%s,%s,'paid',TRUE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            run_id, station_id, body.period_month, body.period_year,
            totals["total_gross"], totals["total_basic"], totals["total_allowances"],
            totals["total_overtime"], totals["total_paye"],
            totals["total_napsa_employee"], totals["total_napsa_employer"],
            totals["total_nhima_employee"], totals["total_nhima_employer"],
            totals["total_wcf_employer"], totals["total_advances"],
            totals["total_net"], totals["total_employer_cost"],
            current_user["user_id"],
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    run = _fetchone(conn, "SELECT * FROM payroll_runs WHERE run_id = %s", (run_id,))
    return _str_dates(run)
