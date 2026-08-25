#!/usr/bin/env python3
"""
Align the Stores two-bin catalog (stock_items.json) with reality, one-off fix.

Background: audit found the Stores catalog (stock_service.py) was seeded
inconsistently across stations:
  - ST001 (Kalulushi): missing all lpg_accessory:* items entirely.
  - ST002 (Luanshya): lpg accessories were seeded under the wrong category
    key ("accessory:*" instead of "lpg_accessory:*", which is what
    apply_handover_sales / seed_catalog actually use) — so any future sale
    would silently fail to decrement stock. Also only 2 of ~87 lubricant
    products were seeded, and existing stores/forecourt balances have no
    movement history behind them (set outside the app, not from real sales).

No real LPG/lubricant/accessory sale has ever gone through the per-shift
attendant capture at either station (verified against attendant_handovers.json
and the daily-entry auto-feed — every value is zero), so there is no live
data to preserve on the sales side. Per station owner direction: Luanshya's
stock counts are to be zeroed and re-entered fresh once real current counts
are taken; Kalulushi's catalog just needs completing (its balances are
already all zero).

WHAT THIS DOES, per station:
  - Adds any missing catalog items (cylinders by size, lubricants from
    lubricant_products.json, lpg accessories from the accessories pricing
    catalog / DEFAULT_LPG_ACCESSORIES fallback) at zero balance.
  - ST002 only: deletes the wrong-category "accessory:*" items, and zeroes
    stores/forecourt on every item (per owner direction).
  - Never touches station_storage, credit accounts, shifts, or any other
    station's data.

USAGE:
  cd backend
  python align_stock_catalog.py --station-id ST001          # dry run
  python align_stock_catalog.py --station-id ST001 --apply  # apply

  DATABASE_URL=postgresql://... python align_stock_catalog.py --station-id ST002 --apply
"""

import os
import sys
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

CYLINDER_SIZES = (3, 6, 9, 19, 45, 48)

# Copied verbatim from app/api/v1/lpg_daily.py's DEFAULT_LPG_ACCESSORIES — the
# fallback load_accessories_catalog() uses when no lpg_accessories_pricing.json
# has been saved yet (true for both live stations today).
DEFAULT_LPG_ACCESSORIES = [
    {"product_code": "ACC-STOVE-1B", "description": "1-Burner Stove", "selling_price": 0},
    {"product_code": "ACC-STOVE-2B", "description": "2-Burner Stove", "selling_price": 0},
    {"product_code": "ACC-COOKTOP", "description": "Cooker Top", "selling_price": 0},
    {"product_code": "ACC-HOSE", "description": "Gas Hose", "selling_price": 0},
    {"product_code": "ACC-REGULATOR", "description": "Gas Regulator", "selling_price": 0},
    {"product_code": "ACC-CLIP", "description": "Hose Clip", "selling_price": 0},
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


def run(station_id: str, apply: bool):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT data FROM station_files WHERE station_id = %s AND filename = %s",
            (station_id, "stock_items.json"),
        ).fetchone()
        items = dict(row[0]) if row and row[0] else {}

        lub_row = conn.execute(
            "SELECT data FROM station_files WHERE station_id = %s AND filename = %s",
            (station_id, "lubricant_products.json"),
        ).fetchone()
        lubricants = lub_row[0] if lub_row and lub_row[0] else []

        acc_row = conn.execute(
            "SELECT data FROM station_files WHERE station_id = %s AND filename = %s",
            (station_id, "lpg_accessories_pricing.json"),
        ).fetchone()
        accessories = acc_row[0] if acc_row and acc_row[0] else DEFAULT_LPG_ACCESSORIES

        wrong_category_keys = [k for k in items if k.startswith("accessory:")]
        to_add = []

        for size in CYLINDER_SIZES:
            for cat, label in (("cylinder_full", "full"), ("cylinder_empty", "empty")):
                key = f"{cat}:{size}kg"
                if key not in items:
                    to_add.append((key, cat, f"{size}kg", f"{size}kg cylinder ({label})", "cylinder"))

        for p in lubricants:
            code = p.get("product_code")
            if code and f"lubricant:{code}" not in items:
                to_add.append((f"lubricant:{code}", "lubricant", code, p.get("description", code), "ea"))

        for p in accessories:
            code = p.get("product_code")
            if code and f"lpg_accessory:{code}" not in items:
                to_add.append((f"lpg_accessory:{code}", "lpg_accessory", code, p.get("description", code), "ea"))

        logger.info("=" * 60)
        logger.info(f"  STOCK CATALOG ALIGN: {station_id}")
        logger.info("=" * 60)
        logger.info("")
        logger.info(f"Existing catalog items: {len(items)}")
        logger.info(f"Items to add (zero balance): {len(to_add)}")
        for key, cat, code, desc, unit in to_add[:20]:
            logger.info(f"    + {key}  ({desc})")
        if len(to_add) > 20:
            logger.info(f"    ... and {len(to_add) - 20} more")
        if wrong_category_keys:
            logger.info(f"Wrong-category items to remove: {len(wrong_category_keys)} -> {wrong_category_keys}")
        nonzero = [(k, v.get('stores', 0), v.get('forecourt', 0)) for k, v in items.items()
                   if (v.get('stores') or 0) or (v.get('forecourt') or 0)]
        if station_id == "ST002" and nonzero:
            logger.info(f"Balances that will be zeroed (owner-directed reset): {len(nonzero)} item(s)")
            for k, s, f in nonzero:
                logger.info(f"    {k}: stores={s} forecourt={f} -> 0/0")
        logger.info("")

        if not apply:
            logger.info("DRY RUN — no changes made. Re-run with --apply to execute.")
            return

        for key, cat, code, desc, unit in to_add:
            items[key] = {
                "item_key": key, "category": cat, "product_code": code,
                "name": desc, "unit": unit, "stores": 0, "forecourt": 0,
                "reorder_level": 0, "reorder_qty": 0,
            }

        for key in wrong_category_keys:
            del items[key]

        if station_id == "ST002":
            for item in items.values():
                item["stores"] = 0
                item["forecourt"] = 0

        conn.execute(
            "UPDATE station_files SET data = %s, updated_at = NOW() "
            "WHERE station_id = %s AND filename = %s",
            (json.dumps(items), station_id, "stock_items.json"),
        )
        logger.info(f"Saved. Catalog now has {len(items)} items.")

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Align Stores catalog for one station.")
    parser.add_argument("--station-id", required=True, help="Station ID (e.g. ST001).")
    parser.add_argument("--apply", action="store_true", help="Actually apply (default is dry run).")
    args = parser.parse_args()
    run(args.station_id, args.apply)


if __name__ == "__main__":
    main()
