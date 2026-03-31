#!/usr/bin/env python3
"""
Reset Station Data — Fresh Start Script

Wipes all operational data from the database while preserving the
system structure needed to boot and run the setup wizard.

WHAT THIS DOES:
  - Deletes all users EXCEPT the owner1 admin account
  - Clears all sessions (everyone gets logged out)
  - Clears all station storage (shifts, readings, sales, etc.)
  - Clears all station files (JSON data per station)
  - Resets station name to "My Station"
  - Keeps table structures, stations registry, and owner1 intact

WHAT THIS DOES NOT DO:
  - Does NOT drop or alter any tables
  - Does NOT change any code or logic
  - Does NOT delete the stations registry (ST001 stays)
  - Does NOT touch the owner1 account password

AFTER RUNNING:
  - The app boots as if freshly deployed
  - owner1 logs in → initialization screen → setup wizard
  - All settings, tanks, staff must be reconfigured

USAGE:
  cd backend
  python reset_station.py

  Or with a specific DATABASE_URL:
  DATABASE_URL=postgresql://... python reset_station.py
"""

import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def reset_file_storage():
    """Reset file-based storage (local dev without PostgreSQL)."""
    import json
    import shutil

    storage_dir = os.path.join(os.path.dirname(__file__), 'storage')
    stations_dir = os.path.join(storage_dir, 'stations')

    confirm = input("Type 'RESET' to confirm: ").strip()
    if confirm != "RESET":
        logger.info("Aborted.")
        sys.exit(0)

    # Clear station data directories
    if os.path.exists(stations_dir):
        for station_id in os.listdir(stations_dir):
            station_path = os.path.join(stations_dir, station_id)
            if os.path.isdir(station_path):
                shutil.rmtree(station_path)
                logger.info(f"  Cleared station data: {station_id}")

    # Reset stations.json
    stations_file = os.path.join(storage_dir, 'stations.json')
    if os.path.exists(stations_file):
        with open(stations_file, 'r') as f:
            stations = json.load(f)
        for sid in stations:
            stations[sid]['name'] = 'My Station'
            stations[sid]['location'] = ''
        with open(stations_file, 'w') as f:
            json.dump(stations, f, indent=2)
        logger.info("  Reset station names.")

    # Clear storage.json (main storage blob)
    storage_file = os.path.join(storage_dir, 'storage.json')
    if os.path.exists(storage_file):
        os.remove(storage_file)
        logger.info("  Cleared storage.json")

    logger.info("")
    logger.info("File-based storage cleared. Restart the app to re-seed defaults.")
    logger.info("Log in as owner1 / owner123 to run the setup wizard.")


def main():
    DATABASE_URL = os.getenv("DATABASE_URL")

    if not DATABASE_URL:
        # Try loading from .env
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('DATABASE_URL='):
                        DATABASE_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break

    if not DATABASE_URL:
        logger.info("No DATABASE_URL found. Clearing file-based storage instead...")
        reset_file_storage()
        return

    logger.info("=" * 60)
    logger.info("  NEXTSTOP STATION RESET")
    logger.info("=" * 60)
    logger.info("")
    logger.info("This will wipe ALL operational data and force a fresh setup.")
    logger.info("The owner1 admin account will be preserved.")
    logger.info("")

    confirm = input("Type 'RESET' to confirm: ").strip()
    if confirm != "RESET":
        logger.info("Aborted.")
        sys.exit(0)

    logger.info("")
    logger.info("Connecting to database...")

    try:
        import psycopg
        conn = psycopg.connect(DATABASE_URL, autocommit=False, connect_timeout=10)
    except Exception as e:
        logger.error(f"Failed to connect: {e}")
        sys.exit(1)

    logger.info("Connected.")
    logger.info("")

    try:
        # 1. Clear all sessions
        logger.info("[1/6] Clearing all sessions...")
        conn.execute("DELETE FROM sessions")
        logger.info("       Sessions cleared.")

        # 2. Delete all users except owner1
        logger.info("[2/6] Removing all users except owner1...")
        result = conn.execute("DELETE FROM users WHERE username != 'owner1'")
        count = result.rowcount
        logger.info(f"       Removed {count} user(s). owner1 preserved.")

        # 3. Reset owner1 name to "Business Owner" (triggers setup wizard)
        logger.info("[3/6] Resetting owner1 name to 'Business Owner'...")
        conn.execute(
            "UPDATE users SET full_name = 'Business Owner' WHERE username = 'owner1'"
        )
        logger.info("       owner1 name reset.")

        # 4. Clear all station storage (the big JSONB blob per station)
        logger.info("[4/6] Clearing all station storage...")
        conn.execute("UPDATE station_storage SET data = '{}'::jsonb, updated_at = NOW()")
        logger.info("       Station storage cleared.")

        # 5. Clear all station files (per-station JSON files)
        logger.info("[5/6] Clearing all station files...")
        result = conn.execute("DELETE FROM station_files")
        count = result.rowcount
        logger.info(f"       Removed {count} station file(s).")

        # 6. Reset station name
        logger.info("[6/6] Resetting station name...")
        conn.execute(
            "UPDATE stations SET data = jsonb_set(data, '{name}', '\"My Station\"'), updated_at = NOW()"
        )
        conn.execute(
            "UPDATE stations SET data = jsonb_set(data, '{location}', '\"\"'), updated_at = NOW()"
        )
        logger.info("       Station name reset to 'My Station'.")

        conn.commit()
        logger.info("")
        logger.info("=" * 60)
        logger.info("  RESET COMPLETE")
        logger.info("=" * 60)
        logger.info("")
        logger.info("Next steps:")
        logger.info("  1. Restart the application (it will re-seed defaults)")
        logger.info("  2. Log in as owner1 / owner123")
        logger.info("  3. Complete the setup wizard")
        logger.info("")

    except Exception as e:
        conn.rollback()
        logger.error(f"ERROR: {e}")
        logger.error("No changes were made (rolled back).")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
