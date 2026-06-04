#!/usr/bin/env python3
"""
Seed Simulation Data — 4 Consecutive Shifts with Full Scenarios

Creates realistic operational data covering all report scenarios:
- 4 shifts across 2 days (Day/Night each)
- 2 attendants per shift (rotating pairs)
- Tank dip readings with carry-forward
- Nozzle readings with various deviations
- Handovers with cash shortages, surpluses, clean shifts
- Safe deposits (some overdue gaps)
- Multiple fuel deliveries on one shift
- Nozzle loss flags, meter deviations

Attendants:
  Shift 1 (Day1 Day):   Katongo (diesel) + Mweene (petrol)
  Shift 2 (Day1 Night): Sunzu (diesel) + Mayuka (petrol)
  Shift 3 (Day2 Day):   Katongo (diesel) + Mayuka (petrol)
  Shift 4 (Day2 Night): Sunzu (diesel) + Mweene (petrol)

Usage:
  DATABASE_URL="postgresql://..." python seed_simulation.py
"""

import os
import sys
import json
import logging
import uuid
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))


def main():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('DATABASE_URL_SYNC='):
                        DATABASE_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
                    elif line.startswith('DATABASE_URL=') and not DATABASE_URL:
                        DATABASE_URL = line.split('=', 1)[1].strip().strip('"').strip("'")

    if not DATABASE_URL:
        logger.error("Set DATABASE_URL environment variable")
        sys.exit(1)

    # Normalize URL
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://", "postgres://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = "postgresql://" + DATABASE_URL[len(prefix):]

    logger.info("=" * 60)
    logger.info("  SEED SIMULATION DATA — 4 SHIFTS, FULL SCENARIOS")
    logger.info("=" * 60)

    import psycopg
    conn = psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=15)

    # Load current station storage
    row = conn.execute("SELECT data FROM station_storage WHERE station_id = 'ST001'").fetchone()
    if not row:
        logger.error("No station storage found for ST001. Complete setup wizard first.")
        sys.exit(1)

    storage = row[0] if isinstance(row[0], dict) else json.loads(row[0])

    tanks = storage.get('tanks', {})
    if not tanks:
        logger.error("No tanks configured. Complete setup wizard first.")
        sys.exit(1)

    # ── CONFIG ────────────────────────────────────────

    today = datetime.now()
    day1 = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    day2 = today.strftime("%Y-%m-%d")

    diesel_price = 23.25
    petrol_price = 26.61

    # Staff pairs per shift
    STAFF = {
        "katongo": {"id": "STF002", "name": "Chris Katongo"},
        "mweene": {"id": "STF003", "name": "Kennedy Mweene"},
        "sunzu": {"id": "STF004", "name": "Stophilla Sunzu"},
        "mayuka": {"id": "STF005", "name": "Emmanuel Mayuka"},
    }

    shift_plans = [
        {
            "shift_id": f"{day1}-Day", "date": day1, "type": "Day",
            "diesel_att": STAFF["katongo"], "petrol_att": STAFF["mweene"],
            "diesel_nozzles": [1245.5, 890.2],   # ISL1-A, ISL1-B volumes
            "petrol_nozzles": [1320.4, 780.1],    # ISL4-A, ISL4-B volumes
            "cash_diff_diesel": -1402.05, "cash_diff_petrol": -40.45,
            "deviation": None,  # clean shift
            "deliveries": [],
            "deposit_times_d": ["08:00", "10:30", "13:00", "16:00"],
            "deposit_times_p": ["07:30", "09:45", "12:15", "15:30"],
        },
        {
            "shift_id": f"{day1}-Night", "date": day1, "type": "Night",
            "diesel_att": STAFF["sunzu"], "petrol_att": STAFF["mayuka"],
            "diesel_nozzles": [699.7, 400.6],
            "petrol_nozzles": [400.5, 250.2],
            "cash_diff_diesel": 26.97, "cash_diff_petrol": 6.16,
            "deviation": {"nozzle": "ISL1-B", "amount": 2.1},  # nozzle loss
            "deliveries": [
                # 3 deliveries on this shift!
                {"tank": "TANK-DIESEL", "time": "19:30", "volume": 10000, "flowmeter": 9875,
                 "tank_dip_change": 9850, "supplier": "Puma Energy Zambia", "invoice": "PEZ-2026-4481"},
                {"tank": "TANK-PETROL", "time": "20:45", "volume": 8000, "flowmeter": 7995,
                 "tank_dip_change": 7990, "supplier": "Oryx Energies Zambia", "invoice": "ORX-2026-7823"},
                {"tank": "TANK-DIESEL", "time": "23:00", "volume": 5000, "flowmeter": 4985,
                 "tank_dip_change": 4930, "supplier": "TotalEnergies Zambia", "invoice": "TEZ-2026-1195"},
            ],
            "deposit_times_d": ["19:00", "21:30"],  # fewer deposits — night shift
            "deposit_times_p": ["19:15", "22:00"],
        },
        {
            "shift_id": f"{day2}-Day", "date": day2, "type": "Day",
            "diesel_att": STAFF["katongo"], "petrol_att": STAFF["mayuka"],
            "diesel_nozzles": [1759.7, 1220.4],
            "petrol_nozzles": [1550.3, 800.6],
            "cash_diff_diesel": -9618.15, "cash_diff_petrol": -30.06,
            "deviation": {"nozzle": "ISL4-B", "amount": 5.8},  # meter deviation on petrol
            "deliveries": [],
            "deposit_times_d": ["08:15", "10:00", "12:30", "15:00", "17:00"],
            "deposit_times_p": ["08:30", "11:00", "14:00"],  # gap > 1hr between 11:00 and 14:00 — overdue
        },
        {
            "shift_id": f"{day2}-Night", "date": day2, "type": "Night",
            "diesel_att": STAFF["sunzu"], "petrol_att": STAFF["mweene"],
            "diesel_nozzles": [520.3, 380.8],
            "petrol_nozzles": [350.1, 270.5],
            "cash_diff_diesel": 15.20, "cash_diff_petrol": 8.40,
            "deviation": None,  # clean
            "deliveries": [
                {"tank": "TANK-PETROL", "time": "21:00", "volume": 6000, "flowmeter": 5990,
                 "tank_dip_change": 5980, "supplier": "Puma Energy Zambia", "invoice": "PEZ-2026-4502"},
            ],
            "deposit_times_d": ["19:30", "22:00"],
            "deposit_times_p": ["20:00", "23:00"],
        },
    ]

    # ── BUILD DATA ────────────────────────────────────

    shifts = storage.get('shifts', {})
    readings = storage.get('readings', [])
    handovers = {}
    safe_deposits = {}
    delivery_history = storage.get('delivery_history', [])

    # Nozzle state carry-forward
    ns = {
        "ISL1-A": {"e": 200000.0, "m": 200000.0},
        "ISL1-B": {"e": 205000.0, "m": 205000.0},
        "ISL4-A": {"e": 150000.0, "m": 150000.0},
        "ISL4-B": {"e": 160000.0, "m": 160000.0},
    }

    diesel_level = 15000.0
    petrol_level = 18000.0

    prev_diesel_close_dip = None
    prev_petrol_close_dip = None

    for si, plan in enumerate(shift_plans):
        sid = plan["shift_id"]
        logger.info(f"\n[{si+1}/4] {plan['type']} Shift — {plan['date']}")

        # Opening dips
        d_open_dip = prev_diesel_close_dip if prev_diesel_close_dip else round(diesel_level / 785.4, 2)
        p_open_dip = prev_petrol_close_dip if prev_petrol_close_dip else round(petrol_level / 785.4, 2)

        # Process deliveries (add to tank before calculating closing)
        for dlv in plan["deliveries"]:
            actual = dlv["tank_dip_change"]
            if dlv["tank"] == "TANK-DIESEL":
                diesel_level += actual
            else:
                petrol_level += actual

            delivery_history.append({
                "delivery_id": f"DLV-{uuid.uuid4().hex[:8]}",
                "tank_id": dlv["tank"],
                "date": plan["date"],
                "time": dlv["time"],
                "supplier": dlv["supplier"],
                "invoice_number": dlv["invoice"],
                "expected_volume": dlv["volume"],
                "flowmeter_volume": dlv["flowmeter"],
                "actual_volume": actual,
                "variance": dlv["volume"] - actual,
                "variance_percent": round((dlv["volume"] - actual) / dlv["volume"] * 100, 2),
                "created_at": f"{plan['date']}T{dlv['time']}:00",
            })
            logger.info(f"       Delivery: {dlv['supplier']} → {dlv['tank']} {dlv['volume']}L (flowmeter {dlv['flowmeter']}L)")

        # Deduct sales
        d_sold = sum(plan["diesel_nozzles"])
        p_sold = sum(plan["petrol_nozzles"])
        diesel_level -= d_sold
        petrol_level -= p_sold

        # Closing dips
        d_close_dip = round(diesel_level / 785.4, 2)
        p_close_dip = round(petrol_level / 785.4, 2)

        prev_diesel_close_dip = d_close_dip
        prev_petrol_close_dip = p_close_dip

        # Nozzle readings
        nozzle_summaries = []
        diesel_nids = ["ISL1-A", "ISL1-B"]
        petrol_nids = ["ISL4-A", "ISL4-B"]

        for j, nid in enumerate(diesel_nids):
            vol = plan["diesel_nozzles"][j]
            eo = ns[nid]["e"]; mo = ns[nid]["m"]
            ec = round(eo + vol, 3)
            dev = plan["deviation"]["amount"] if plan.get("deviation") and plan["deviation"]["nozzle"] == nid else round(vol * 0.0003, 1)
            mc = round(mo + vol - dev, 0)
            ns[nid]["e"] = ec; ns[nid]["m"] = mc
            rev = round(vol * diesel_price, 2)
            flagged = dev > 0.8

            nozzle_summaries.append({
                "nozzle_id": nid, "fuel_type": "Diesel",
                "opening_reading": eo, "closing_reading": ec,
                "volume_sold": vol, "price_per_liter": diesel_price, "revenue": rev,
                "mechanical_opening": mo, "mechanical_closing": mc,
                "mechanical_volume": round(mc - mo, 3),
                "meter_deviation_liters": dev,
                "meter_deviation_percent": round(dev / vol * 100, 2) if vol > 0 else 0,
                "meter_deviation_flagged": flagged,
            })
            readings.append({
                "nozzle_id": nid, "fuel_type": "Diesel", "shift_id": sid,
                "date": plan["date"], "shift_type": plan["type"],
                "staff_name": plan["diesel_att"]["name"],
                "electronic_opening": eo, "electronic_closing": ec,
                "mechanical_opening": mo, "mechanical_closing": mc,
                "volume": vol, "island_id": "ISL-001",
            })

        for j, nid in enumerate(petrol_nids):
            vol = plan["petrol_nozzles"][j]
            eo = ns[nid]["e"]; mo = ns[nid]["m"]
            ec = round(eo + vol, 3)
            dev = plan["deviation"]["amount"] if plan.get("deviation") and plan["deviation"]["nozzle"] == nid else round(vol * 0.0003, 1)
            mc = round(mo + vol - dev, 0)
            ns[nid]["e"] = ec; ns[nid]["m"] = mc
            rev = round(vol * petrol_price, 2)
            flagged = dev > 0.8

            nozzle_summaries.append({
                "nozzle_id": nid, "fuel_type": "Petrol",
                "opening_reading": eo, "closing_reading": ec,
                "volume_sold": vol, "price_per_liter": petrol_price, "revenue": rev,
                "mechanical_opening": mo, "mechanical_closing": mc,
                "mechanical_volume": round(mc - mo, 3),
                "meter_deviation_liters": dev,
                "meter_deviation_percent": round(dev / vol * 100, 2) if vol > 0 else 0,
                "meter_deviation_flagged": flagged,
            })
            readings.append({
                "nozzle_id": nid, "fuel_type": "Petrol", "shift_id": sid,
                "date": plan["date"], "shift_type": plan["type"],
                "staff_name": plan["petrol_att"]["name"],
                "electronic_opening": eo, "electronic_closing": ec,
                "mechanical_opening": mo, "mechanical_closing": mc,
                "volume": vol, "island_id": "ISL-004",
            })

        # Build shift record
        shifts[sid] = {
            "shift_id": sid, "date": plan["date"], "shift_type": plan["type"],
            "attendants": [plan["diesel_att"]["name"], plan["petrol_att"]["name"]],
            "assignments": [
                {"attendant_id": plan["diesel_att"]["id"], "attendant_name": plan["diesel_att"]["name"],
                 "island_ids": ["ISL-001"], "nozzle_ids": ["ISL1-A", "ISL1-B"]},
                {"attendant_id": plan["petrol_att"]["id"], "attendant_name": plan["petrol_att"]["name"],
                 "island_ids": ["ISL-004"], "nozzle_ids": ["ISL4-A", "ISL4-B"]},
            ],
            "status": "completed",
            "created_by": "system", "created_at": f"{plan['date']}T06:00:00",
            "tank_dip_readings": [
                {"tank_id": "TANK-DIESEL", "opening_dip_cm": d_open_dip, "closing_dip_cm": d_close_dip,
                 "opening_volume_liters": round(d_open_dip * 785.4, 0),
                 "closing_volume_liters": round(d_close_dip * 785.4, 0),
                 "recorded_at": f"{plan['date']}T18:00:00", "recorded_by": "system"},
                {"tank_id": "TANK-PETROL", "opening_dip_cm": p_open_dip, "closing_dip_cm": p_close_dip,
                 "opening_volume_liters": round(p_open_dip * 785.4, 0),
                 "closing_volume_liters": round(p_close_dip * 785.4, 0),
                 "recorded_at": f"{plan['date']}T18:00:00", "recorded_by": "system"},
            ],
        }

        # Handovers (one per attendant)
        for att_key, att_info, att_nozzles, cash_diff, dep_times in [
            ("diesel", plan["diesel_att"], nozzle_summaries[:2], plan["cash_diff_diesel"], plan["deposit_times_d"]),
            ("petrol", plan["petrol_att"], nozzle_summaries[2:], plan["cash_diff_petrol"], plan["deposit_times_p"]),
        ]:
            att_rev = sum(n["revenue"] for n in att_nozzles)
            att_actual = round(att_rev + cash_diff, 2)
            flags = []
            if cash_diff < -500: flags.append("cash_shortage")
            if any(n["meter_deviation_flagged"] for n in att_nozzles): flags.append("meter_deviation")

            ho_id = f"HO-{sid}-{att_info['id']}"
            handovers[ho_id] = {
                "handover_id": ho_id, "shift_id": sid,
                "attendant_id": att_info["id"], "attendant_name": att_info["name"],
                "date": plan["date"], "shift_type": plan["type"],
                "nozzle_summaries": att_nozzles,
                "fuel_revenue": att_rev,
                "lpg_sales": 0, "lubricant_sales": 0, "accessory_sales": 0,
                "total_expected": att_rev, "credit_sales": 0,
                "expected_cash": att_rev, "actual_cash": att_actual,
                "difference": round(cash_diff, 2),
                "status": "submitted", "review_status": "approved",
                "supervisor_review": {
                    "reviewed_by": "STF001", "reviewed_by_name": "Herve Renard",
                    "reviewed_at": f"{plan['date']}T19:00:00",
                    "action": "approve", "note": "Approved",
                },
                "auto_flag_reasons": flags,
                "notes": "Nozzle deviation noted" if "meter_deviation" in flags else "",
                "created_at": f"{plan['date']}T18:00:00",
            }

            # Safe deposits
            if sid not in safe_deposits:
                safe_deposits[sid] = {"shift_id": sid, "deposits": []}
            for dt in dep_times:
                safe_deposits[sid]["deposits"].append({
                    "deposit_id": f"DEP-{uuid.uuid4().hex[:8]}",
                    "attendant_id": att_info["id"], "attendant_name": att_info["name"],
                    "amount": round(att_rev / len(dep_times), 0),
                    "time": dt,
                    "timestamp": f"{plan['date']}T{dt}:00",
                    "recorded_at": f"{plan['date']}T{dt}:00",
                    "note": "",
                })

        logger.info(f"       Diesel: {d_sold}L ({plan['diesel_att']['name']})")
        logger.info(f"       Petrol: {p_sold}L ({plan['petrol_att']['name']})")
        logger.info(f"       Cash diff: D=K{plan['cash_diff_diesel']}, P=K{plan['cash_diff_petrol']}")
        if plan.get("deviation"):
            logger.info(f"       FLAG: {plan['deviation']['nozzle']} deviation {plan['deviation']['amount']}L")
        logger.info(f"       Deliveries: {len(plan['deliveries'])}")

    # ── SAVE TO DATABASE ──────────────────────────────

    logger.info("\n" + "=" * 60)
    logger.info("Saving to database...")

    storage['shifts'] = shifts
    storage['readings'] = readings
    storage['delivery_history'] = delivery_history

    from psycopg.types.json import Jsonb

    # Save station storage
    conn.execute("""
        INSERT INTO station_storage (station_id, data, updated_at)
        VALUES ('ST001', %s, NOW())
        ON CONFLICT (station_id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    """, (Jsonb(storage),))

    # Save handovers
    conn.execute("""
        INSERT INTO station_files (station_id, filename, data, updated_at)
        VALUES ('ST001', 'attendant_handovers.json', %s, NOW())
        ON CONFLICT (station_id, filename)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    """, (Jsonb(handovers),))

    # Save safe deposits
    conn.execute("""
        INSERT INTO station_files (station_id, filename, data, updated_at)
        VALUES ('ST001', 'safe_deposits.json', %s, NOW())
        ON CONFLICT (station_id, filename)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    """, (Jsonb(safe_deposits),))

    conn.close()

    total_deposits = sum(len(d["deposits"]) for d in safe_deposits.values())
    total_deliveries = len(delivery_history)

    logger.info(f"  Shifts:         4")
    logger.info(f"  Readings:       {len(readings)}")
    logger.info(f"  Handovers:      {len(handovers)}")
    logger.info(f"  Safe deposits:  {total_deposits}")
    logger.info(f"  Deliveries:     {total_deliveries}")
    logger.info(f"  Dip readings:   8 (2 tanks x 4 shifts)")
    logger.info("")
    logger.info("FLAGS SEEDED:")
    logger.info(f"  Shift 1 ({day1} Day):   CLEAN")
    logger.info(f"  Shift 2 ({day1} Night): Nozzle loss ISL1-B (2.1L), 3 deliveries")
    logger.info(f"  Shift 3 ({day2} Day):   Cash shortage (~K9,648), Meter deviation ISL4-B (5.8L)")
    logger.info(f"  Shift 4 ({day2} Night): CLEAN, 1 delivery")
    logger.info("")
    logger.info("=" * 60)
    logger.info("  SIMULATION DATA SEEDED SUCCESSFULLY")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Restart the backend service, then check:")
    logger.info("  - Tank Readings & Monitor")
    logger.info("  - Shift Reconciliation")
    logger.info("  - Handover Review")
    logger.info("  - Sales Reports / Advanced Reports")
    logger.info("  - Safe Deposits (Shifts page)")


if __name__ == "__main__":
    main()
