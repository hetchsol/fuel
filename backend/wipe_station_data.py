#!/usr/bin/env python3
"""
Wipe Station Transactional Data — Fresh Start Script (single station)

Unlike reset_station.py (which wipes EVERY station), this clears the
operational/transactional history for ONE station only, identified by
--station-id. Configuration (tanks, islands, accounts, staff, product
catalogs, calibrations, settings) is preserved untouched. Other stations
are never touched.

WHAT GETS CLEARED for the target station:
  station_storage (JSONB) keys reset to empty:
    shifts, readings, lpg_sales, lubricant_sales, credit_sales,
    shift_reconciliations, tank_reconciliations, lpg_daily_entries,
    lpg_accessories_daily, lubricant_daily_entries, reconciliations_data,
    tank_reconciliations_data, delivery_history, dip_readings_data,
    accessories_sales

  station_files rows deleted (by filename):
    attendant_handovers.json, tank_readings.json, tank_deliveries.json,
    attendant_readings.json, daily_close_offs.json,
    daily_close_off_reopen_log.json, opening_verifications.json,
    notifications.json, reconciliations.json, investigations.json,
    sales.json, safe_deposits.json, validated_readings.json,
    price_corrections.json, stock_movements.json, stock_takes.json

  Credit account balances (inside the 'accounts' dict):
    Post-Paid  -> current_balance reset to 0.0
    Pre-Paid   -> current_balance reset to opening_balance (or 0.0)
    All other account fields (name, client_code, credit_limit,
    approved_overdraft, opening_balance) are left untouched.

WHAT IS PRESERVED (not touched):
  - users, islands, tanks, accounts (minus balance reset), lubricants,
    lpg_accessories, fuel_settings, system_settings,
    validation_thresholds, tax_levy_settings, stock_alert_settings,
    reconciliation_tolerance_settings
  - station_files: tank_calibrations.json, tank_calibration_history.json,
    lubricant_products.json, lpg_accessories_pricing.json,
    lpg_pricing.json, pos_settings.json, email_settings.json,
    customers.json, scheduled_price_changes.json,
    price_correction_delegations.json, stock_items.json, audit_log.json,
    backup_index.json, backup_*.json.gz
  - Every other station's data (all operations are WHERE station_id = %s)

USAGE:
  cd backend

  # Step 1 — safe, read-only: list all stations and their IDs
  python wipe_station_data.py --list

  # Step 2 — dry run: show what WOULD be cleared, no writes
  python wipe_station_data.py --station-id ST002

  # Step 3 — actually wipe (requires typing the station's exact name)
  python wipe_station_data.py --station-id ST002 --apply

  Or with a specific DATABASE_URL:
  DATABASE_URL=postgresql://... python wipe_station_data.py --list
"""

import os
import sys
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# station_storage JSONB keys to clear, and the empty value to reset them to
WIPE_STORAGE_KEYS = {
    'shifts': {},
    'readings': [],
    'lpg_sales': [],
    'lubricant_sales': [],
    'credit_sales': [],
    'shift_reconciliations': [],
    'tank_reconciliations': [],
    'lpg_daily_entries': {},
    'lpg_accessories_daily': {},
    'lubricant_daily_entries': {},
    'reconciliations_data': [],
    'tank_reconciliations_data': [],
    'delivery_history': [],
    'dip_readings_data': {},
    'accessories_sales': [],
}

# station_files filenames to delete outright
WIPE_FILENAMES = [
    'attendant_handovers.json',
    'tank_readings.json',
    'tank_deliveries.json',
    'attendant_readings.json',
    'daily_close_offs.json',
    'daily_close_off_reopen_log.json',
    'opening_verifications.json',
    'notifications.json',
    'reconciliations.json',
    'investigations.json',
    'sales.json',
    'safe_deposits.json',
    'validated_readings.json',
    'price_corrections.json',
    'stock_movements.json',
    'stock_takes.json',
]


def _normalize_db_url(url: str) -> str:
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


def _get_database_url() -> str:
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                env_vars = {}
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, val = line.split('=', 1)
                        env_vars[key.strip()] = val.strip().strip('"').strip("'")
                DATABASE_URL = env_vars.get('DATABASE_URL_SYNC') or env_vars.get('DATABASE_URL')
    if not DATABASE_URL:
        logger.error("No DATABASE_URL found (env var or backend/.env).")
        sys.exit(1)
    return _normalize_db_url(DATABASE_URL)


def _connect():
    import psycopg
    DATABASE_URL = _get_database_url()
    direct_url = DATABASE_URL.replace("-pooler.", ".")
    return psycopg.connect(direct_url, autocommit=True, connect_timeout=15)


def list_stations():
    conn = _connect()
    try:
        rows = conn.execute("SELECT station_id, data FROM stations ORDER BY station_id").fetchall()
        logger.info("")
        logger.info(f"{'station_id':<12}{'name':<30}{'status'}")
        logger.info("-" * 60)
        for station_id, data in rows:
            name = (data or {}).get('name', '')
            status = (data or {}).get('status', '')
            logger.info(f"{station_id:<12}{name:<30}{status}")
        logger.info("")
    finally:
        conn.close()


def _reset_account_balances(accounts: dict) -> int:
    reset_count = 0
    for acc_id, acc in accounts.items():
        acc_type = acc.get('account_type', 'Post-Paid')
        old_balance = acc.get('current_balance', 0.0)
        if acc_type == 'Pre-Paid':
            new_balance = acc.get('opening_balance') or 0.0
        else:
            new_balance = 0.0
        if old_balance != new_balance:
            acc['current_balance'] = new_balance
            reset_count += 1
    return reset_count


def run(station_id: str, apply: bool):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT data FROM stations WHERE station_id = %s", (station_id,)
        ).fetchone()
        if not row:
            logger.error(f"Station '{station_id}' not found in the stations table.")
            sys.exit(1)
        station_name = (row[0] or {}).get('name', station_id)

        storage_row = conn.execute(
            "SELECT data FROM station_storage WHERE station_id = %s", (station_id,)
        ).fetchone()
        storage_data = storage_row[0] if storage_row and storage_row[0] else {}

        existing_files = conn.execute(
            "SELECT filename FROM station_files WHERE station_id = %s AND filename = ANY(%s)",
            (station_id, WIPE_FILENAMES)
        ).fetchall()
        existing_filenames = [r[0] for r in existing_files]

        accounts = storage_data.get('accounts', {})
        accounts_with_balance = sum(1 for a in accounts.values() if a.get('current_balance'))

        logger.info("=" * 60)
        logger.info(f"  STATION WIPE: {station_id} ({station_name})")
        logger.info("=" * 60)
        logger.info("")
        logger.info("station_storage keys to be cleared:")
        for key in WIPE_STORAGE_KEYS:
            val = storage_data.get(key)
            count = len(val) if isinstance(val, (list, dict)) else 0
            if count:
                logger.info(f"    {key:<28} {count} item(s)")
        logger.info("")
        logger.info("station_files to be deleted:")
        for fn in existing_filenames:
            logger.info(f"    {fn}")
        if not existing_filenames:
            logger.info("    (none found)")
        logger.info("")
        logger.info(f"Credit accounts with a non-zero current_balance: {accounts_with_balance}")
        logger.info("  -> Post-Paid accounts will reset to 0.0")
        logger.info("  -> Pre-Paid accounts will reset to their opening_balance")
        logger.info("")
        logger.info("PRESERVED (not touched): users, islands, tanks, accounts (minus")
        logger.info("balance reset), product catalogs, calibrations, all settings,")
        logger.info("audit_log.json, backups, and every other station.")
        logger.info("")

        if not apply:
            logger.info("DRY RUN — no changes made. Re-run with --apply to execute.")
            return

        confirm = input(f"Type the station name exactly ('{station_name}') to confirm: ").strip()
        if confirm != station_name:
            logger.info("Name did not match. Aborted, nothing changed.")
            sys.exit(0)

        new_data = dict(storage_data)
        for key, empty_val in WIPE_STORAGE_KEYS.items():
            if key in new_data:
                new_data[key] = empty_val

        reset_count = _reset_account_balances(new_data.get('accounts', {}))

        conn.execute(
            "UPDATE station_storage SET data = %s, updated_at = NOW() WHERE station_id = %s",
            (json.dumps(new_data), station_id)
        )
        logger.info("Cleared station_storage transactional keys.")

        if existing_filenames:
            conn.execute(
                "DELETE FROM station_files WHERE station_id = %s AND filename = ANY(%s)",
                (station_id, existing_filenames)
            )
            logger.info(f"Deleted {len(existing_filenames)} station_files row(s).")

        logger.info(f"Reset current_balance on {reset_count} credit account(s).")
        logger.info("")
        logger.info("=" * 60)
        logger.info("  WIPE COMPLETE")
        logger.info("=" * 60)
        logger.info("")
        logger.info("Next steps:")
        logger.info("  1. Have the station owner log in — owner login auto-reloads that")
        logger.info("     station's storage from the DB (see auth.py). If the API runs on")
        logger.info("     multiple instances, restart the service to clear cached copies")
        logger.info("     everywhere.")
        logger.info("  2. Begin re-entering shifts/readings from paper records starting")
        logger.info("     2026-08-18.")
        logger.info("")

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Wipe transactional data for one station.")
    parser.add_argument("--list", action="store_true", help="List all stations and exit.")
    parser.add_argument("--station-id", help="Station ID to wipe (e.g. ST002).")
    parser.add_argument("--apply", action="store_true", help="Actually apply the wipe (default is dry run).")
    args = parser.parse_args()

    if args.list:
        list_stations()
        return

    if not args.station_id:
        parser.error("--station-id is required (or use --list to see options).")

    run(args.station_id, args.apply)


if __name__ == "__main__":
    main()
