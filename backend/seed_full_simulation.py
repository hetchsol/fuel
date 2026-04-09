#!/usr/bin/env python3
"""
Full Simulation Seed — March 1 to April 9, 2026
80 shifts (2 per day × 40 days), every scenario covered.

Scenarios distributed across the period:
- Clean shifts (majority)
- Cash shortages (small and large)
- Cash surpluses
- Nozzle meter deviations (flagged)
- Nozzle losses exceeding threshold
- Multiple deliveries on single shifts
- Delivery variances (invoice vs flowmeter vs dip)
- Safe deposit overdue gaps (>1hr between deposits)
- Weekend lower volume patterns
- Tank levels managed with deliveries when stock drops low

Usage:
  DATABASE_URL="postgresql://..." python seed_full_simulation.py
"""

import os, sys, json, logging, uuid, random
from datetime import datetime, timedelta, date

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
sys.path.insert(0, os.path.dirname(__file__))

random.seed(42)  # Reproducible

def main():
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        logger.error("Set DATABASE_URL environment variable")
        sys.exit(1)

    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://", "postgres://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = "postgresql://" + DATABASE_URL[len(prefix):]

    logger.info("=" * 60)
    logger.info("  FULL SIMULATION SEED — March 1 to April 9, 2026")
    logger.info("=" * 60)

    import psycopg
    from psycopg.types.json import Jsonb
    conn = psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=15)

    row = conn.execute("SELECT data FROM station_storage WHERE station_id = 'ST001'").fetchone()
    if not row:
        logger.error("No station storage found for ST001.")
        sys.exit(1)

    storage = row[0] if isinstance(row[0], dict) else json.loads(row[0])

    # ── SET FUEL PRICES ────────────────────────────────
    settings = storage.get('settings', {})
    DIESEL_PRICE = 23.25
    PETROL_PRICE = 26.61
    settings['diesel_price_per_liter'] = DIESEL_PRICE
    settings['petrol_price_per_liter'] = PETROL_PRICE
    storage['settings'] = settings

    # ── CONFIG ────────────────────────────────────────
    START_DATE = date(2026, 3, 1)
    END_DATE = date(2026, 4, 9)

    STAFF = {
        "katongo": {"id": "STF002", "name": "Chris Katongo"},
        "mweene": {"id": "STF003", "name": "Kennedy Mweene"},
        "sunzu": {"id": "STF004", "name": "Stophilla Sunzu"},
        "mayuka": {"id": "STF005", "name": "Emmanuel Mayuka"},
    }

    # Rotating pairs
    SHIFT_PAIRS = [
        (STAFF["katongo"], STAFF["mweene"]),   # Pair A
        (STAFF["sunzu"], STAFF["mayuka"]),      # Pair B
        (STAFF["katongo"], STAFF["mayuka"]),    # Pair C
        (STAFF["sunzu"], STAFF["mweene"]),      # Pair D
    ]

    SUPPLIERS = [
        ("Puma Energy Zambia", "PEZ"),
        ("Oryx Energies Zambia", "ORX"),
        ("TotalEnergies Zambia", "TEZ"),
        ("Vivo Energy Zambia", "VEZ"),
    ]

    # Nozzle config
    DIESEL_NOZZLES = ["ISL1-A", "ISL1-B", "ISL2-A", "ISL2-B", "ISL3-A", "ISL3-B"]
    PETROL_NOZZLES = ["ISL4-A", "ISL4-B", "ISL5-A", "ISL5-B", "ISL6-A", "ISL6-B"]
    DIESEL_ISLANDS = {"ISL1-A": "ISL-001", "ISL1-B": "ISL-001", "ISL2-A": "ISL-002", "ISL2-B": "ISL-002", "ISL3-A": "ISL-003", "ISL3-B": "ISL-003"}
    PETROL_ISLANDS = {"ISL4-A": "ISL-004", "ISL4-B": "ISL-004", "ISL5-A": "ISL-005", "ISL5-B": "ISL-005", "ISL6-A": "ISL-006", "ISL6-B": "ISL-006"}

    # Starting nozzle meter positions
    ns = {}
    for nid in DIESEL_NOZZLES:
        ns[nid] = {"e": 100000.0 + random.randint(0, 50000), "m": 100000.0 + random.randint(0, 50000)}
    for nid in PETROL_NOZZLES:
        ns[nid] = {"e": 80000.0 + random.randint(0, 40000), "m": 80000.0 + random.randint(0, 40000)}

    # Tank levels
    diesel_level = 35000.0
    petrol_level = 20000.0
    DIESEL_CAPACITY = 90000.0  # Combined diesel tank capacity
    PETROL_CAPACITY = 25000.0

    # ── SCENARIO SCHEDULE ─────────────────────────────
    # Pre-define which days have special scenarios
    total_days = (END_DATE - START_DATE).days + 1

    # Assign scenarios to specific days
    shortage_days = {3, 7, 14, 22, 30, 37}       # Cash shortage
    surplus_days = {5, 12, 20, 28, 35}            # Cash surplus
    deviation_days = {4, 10, 18, 25, 33, 39}      # Meter deviation on a nozzle
    loss_days = {6, 15, 24, 36}                    # Nozzle loss exceeding threshold
    multi_delivery_days = {8, 19, 31}              # 2-3 deliveries in one shift
    overdue_deposit_days = {9, 17, 26, 34}         # Deposit gap > 1hr

    # ── BUILD DATA ────────────────────────────────────
    shifts = {}
    readings = []
    handovers = {}
    safe_deposits = {}
    delivery_history = storage.get('delivery_history', [])
    # Clear existing delivery history to avoid duplicates
    delivery_history = []

    prev_diesel_close_dip = None
    prev_petrol_close_dip = None

    shift_count = 0
    scenario_log = []

    current = START_DATE
    while current <= END_DATE:
        day_str = current.strftime("%Y-%m-%d")
        day_num = (current - START_DATE).days
        is_weekend = current.weekday() >= 5  # Sat=5, Sun=6

        for shift_type in ["Day", "Night"]:
            shift_count += 1
            sid = f"{day_str}-{shift_type}"
            pair_idx = shift_count % len(SHIFT_PAIRS)
            diesel_att, petrol_att = SHIFT_PAIRS[pair_idx]

            # Volume ranges — lower on weekends and nights
            base_d = random.uniform(600, 1800) if shift_type == "Day" else random.uniform(300, 900)
            base_p = random.uniform(500, 1500) if shift_type == "Day" else random.uniform(250, 700)
            if is_weekend:
                base_d *= 0.6
                base_p *= 0.65

            # Split across nozzles (3 diesel + 3 petrol nozzles per attendant)
            d_vols = []
            for _ in DIESEL_NOZZLES:
                v = round(base_d / len(DIESEL_NOZZLES) * random.uniform(0.7, 1.3), 1)
                d_vols.append(v)
            p_vols = []
            for _ in PETROL_NOZZLES:
                v = round(base_p / len(PETROL_NOZZLES) * random.uniform(0.7, 1.3), 1)
                p_vols.append(v)

            total_d = sum(d_vols)
            total_p = sum(p_vols)

            # ── Determine scenarios for this shift ──
            scenarios = []
            cash_diff_d = round(random.uniform(-50, 50), 2)  # Normal small variance
            cash_diff_p = round(random.uniform(-30, 30), 2)
            deviation_nozzle = None
            deviation_amount = 0

            if day_num in shortage_days and shift_type == "Day":
                shortage = round(random.uniform(2000, 15000), 2)
                cash_diff_d = -shortage
                scenarios.append(f"Cash shortage K{shortage:.0f}")

            if day_num in surplus_days and shift_type == "Night":
                surplus = round(random.uniform(100, 800), 2)
                cash_diff_d = surplus
                scenarios.append(f"Cash surplus K{surplus:.0f}")

            if day_num in deviation_days:
                if shift_type == "Day":
                    nid = random.choice(DIESEL_NOZZLES)
                    deviation_nozzle = nid
                    deviation_amount = round(random.uniform(2.0, 8.0), 1)
                    scenarios.append(f"Meter deviation {nid} {deviation_amount}L")
                else:
                    nid = random.choice(PETROL_NOZZLES)
                    deviation_nozzle = nid
                    deviation_amount = round(random.uniform(1.5, 6.0), 1)
                    scenarios.append(f"Meter deviation {nid} {deviation_amount}L")

            if day_num in loss_days and shift_type == "Night":
                nid = random.choice(DIESEL_NOZZLES)
                deviation_nozzle = nid
                deviation_amount = round(random.uniform(3.0, 10.0), 1)
                scenarios.append(f"Nozzle loss {nid} {deviation_amount}L")

            # ── Deliveries ──
            shift_deliveries = []
            # Regular delivery when tank drops below 30%
            if diesel_level < DIESEL_CAPACITY * 0.30 and shift_type == "Day":
                vol = random.choice([10000, 15000, 20000])
                fm = vol - random.randint(10, 50)
                dip = fm - random.randint(5, 80)
                sup = random.choice(SUPPLIERS)
                shift_deliveries.append({
                    "tank": "TANK-DIESEL", "time": f"{random.randint(8,11)}:{random.choice(['00','15','30','45'])}",
                    "volume": vol, "flowmeter": fm, "tank_dip_change": dip,
                    "supplier": sup[0], "invoice": f"{sup[1]}-2026-{random.randint(1000,9999)}"
                })
                scenarios.append(f"Diesel delivery {vol}L")

            if petrol_level < PETROL_CAPACITY * 0.35 and shift_type == "Day":
                vol = random.choice([6000, 8000, 10000])
                fm = vol - random.randint(5, 30)
                dip = fm - random.randint(5, 60)
                sup = random.choice(SUPPLIERS)
                shift_deliveries.append({
                    "tank": "PETROL TANK 2", "time": f"{random.randint(9,14)}:{random.choice(['00','15','30','45'])}",
                    "volume": vol, "flowmeter": fm, "tank_dip_change": dip,
                    "supplier": sup[0], "invoice": f"{sup[1]}-2026-{random.randint(1000,9999)}"
                })
                scenarios.append(f"Petrol delivery {vol}L")

            if day_num in multi_delivery_days and shift_type == "Night":
                for _ in range(random.randint(2, 3)):
                    is_diesel = random.choice([True, False])
                    vol = random.choice([5000, 8000, 10000, 12000])
                    fm = vol - random.randint(10, 40)
                    dip = fm - random.randint(10, 70)
                    sup = random.choice(SUPPLIERS)
                    tank = "TANK-DIESEL" if is_diesel else "PETROL TANK 2"
                    shift_deliveries.append({
                        "tank": tank, "time": f"{random.randint(18,23)}:{random.choice(['00','15','30','45'])}",
                        "volume": vol, "flowmeter": fm, "tank_dip_change": dip,
                        "supplier": sup[0], "invoice": f"{sup[1]}-2026-{random.randint(1000,9999)}"
                    })
                scenarios.append(f"Multi-delivery x{len(shift_deliveries)}")

            # ── Opening dips ──
            d_open_dip = prev_diesel_close_dip if prev_diesel_close_dip else round(diesel_level / 785.4, 2)
            p_open_dip = prev_petrol_close_dip if prev_petrol_close_dip else round(petrol_level / 785.4, 2)

            # ── Process deliveries ──
            for dlv in shift_deliveries:
                actual = dlv["tank_dip_change"]
                if "DIESEL" in dlv["tank"]:
                    diesel_level += actual
                else:
                    petrol_level += actual

                delivery_history.append({
                    "delivery_id": f"DLV-{uuid.uuid4().hex[:8]}",
                    "tank_id": dlv["tank"],
                    "date": day_str,
                    "time": dlv["time"],
                    "supplier": dlv["supplier"],
                    "invoice_number": dlv["invoice"],
                    "expected_volume": dlv["volume"],
                    "flowmeter_volume": dlv["flowmeter"],
                    "actual_volume": actual,
                    "variance": dlv["volume"] - actual,
                    "variance_percent": round((dlv["volume"] - actual) / dlv["volume"] * 100, 2),
                    "created_at": f"{day_str}T{dlv['time']}:00",
                })

            # ── Deduct sales from tanks ──
            diesel_level -= total_d
            petrol_level -= total_p
            diesel_level = max(diesel_level, 500)  # Never go fully empty
            petrol_level = max(petrol_level, 300)

            # ── Closing dips ──
            d_close_dip = round(diesel_level / 785.4, 2)
            p_close_dip = round(petrol_level / 785.4, 2)
            prev_diesel_close_dip = d_close_dip
            prev_petrol_close_dip = p_close_dip

            # ── Nozzle readings ──
            nozzle_summaries = []

            for j, nid in enumerate(DIESEL_NOZZLES):
                vol = d_vols[j]
                eo = ns[nid]["e"]; mo = ns[nid]["m"]
                ec = round(eo + vol, 3)
                if deviation_nozzle == nid:
                    dev = deviation_amount
                else:
                    dev = round(vol * random.uniform(0.0001, 0.0005), 1)
                mc = round(mo + vol - dev, 0)
                ns[nid]["e"] = ec; ns[nid]["m"] = mc
                rev = round(vol * DIESEL_PRICE, 2)
                flagged = dev > 0.8

                nozzle_summaries.append({
                    "nozzle_id": nid, "fuel_type": "Diesel",
                    "opening_reading": eo, "closing_reading": ec,
                    "volume_sold": vol, "price_per_liter": DIESEL_PRICE, "revenue": rev,
                    "mechanical_opening": mo, "mechanical_closing": mc,
                    "mechanical_volume": round(mc - mo, 3),
                    "meter_deviation_liters": dev,
                    "meter_deviation_percent": round(dev / vol * 100, 2) if vol > 0 else 0,
                    "meter_deviation_flagged": flagged,
                })
                readings.append({
                    "nozzle_id": nid, "fuel_type": "Diesel", "shift_id": sid,
                    "date": day_str, "shift_type": shift_type,
                    "staff_name": diesel_att["name"],
                    "electronic_opening": eo, "electronic_closing": ec,
                    "mechanical_opening": mo, "mechanical_closing": mc,
                    "volume": vol, "island_id": DIESEL_ISLANDS[nid],
                    "total_amount": rev,
                })

            for j, nid in enumerate(PETROL_NOZZLES):
                vol = p_vols[j]
                eo = ns[nid]["e"]; mo = ns[nid]["m"]
                ec = round(eo + vol, 3)
                if deviation_nozzle == nid:
                    dev = deviation_amount
                else:
                    dev = round(vol * random.uniform(0.0001, 0.0005), 1)
                mc = round(mo + vol - dev, 0)
                ns[nid]["e"] = ec; ns[nid]["m"] = mc
                rev = round(vol * PETROL_PRICE, 2)
                flagged = dev > 0.8

                nozzle_summaries.append({
                    "nozzle_id": nid, "fuel_type": "Petrol",
                    "opening_reading": eo, "closing_reading": ec,
                    "volume_sold": vol, "price_per_liter": PETROL_PRICE, "revenue": rev,
                    "mechanical_opening": mo, "mechanical_closing": mc,
                    "mechanical_volume": round(mc - mo, 3),
                    "meter_deviation_liters": dev,
                    "meter_deviation_percent": round(dev / vol * 100, 2) if vol > 0 else 0,
                    "meter_deviation_flagged": flagged,
                })
                readings.append({
                    "nozzle_id": nid, "fuel_type": "Petrol", "shift_id": sid,
                    "date": day_str, "shift_type": shift_type,
                    "staff_name": petrol_att["name"],
                    "electronic_opening": eo, "electronic_closing": ec,
                    "mechanical_opening": mo, "mechanical_closing": mc,
                    "volume": vol, "island_id": PETROL_ISLANDS[nid],
                    "total_amount": rev,
                })

            # ── Shift record ──
            shifts[sid] = {
                "shift_id": sid, "date": day_str, "shift_type": shift_type,
                "attendants": [diesel_att["name"], petrol_att["name"]],
                "assignments": [
                    {"attendant_id": diesel_att["id"], "attendant_name": diesel_att["name"],
                     "island_ids": list(set(DIESEL_ISLANDS.values())), "nozzle_ids": DIESEL_NOZZLES},
                    {"attendant_id": petrol_att["id"], "attendant_name": petrol_att["name"],
                     "island_ids": list(set(PETROL_ISLANDS.values())), "nozzle_ids": PETROL_NOZZLES},
                ],
                "status": "completed",
                "created_by": "system", "created_at": f"{day_str}T{'06' if shift_type == 'Day' else '18'}:00:00",
                "tank_dip_readings": [
                    {"tank_id": "TANK-DIESEL", "opening_dip_cm": d_open_dip, "closing_dip_cm": d_close_dip,
                     "opening_volume_liters": round(d_open_dip * 785.4, 0),
                     "closing_volume_liters": round(d_close_dip * 785.4, 0),
                     "recorded_at": f"{day_str}T{'18' if shift_type == 'Day' else '06'}:00:00", "recorded_by": "system"},
                    {"tank_id": "PETROL TANK 2", "opening_dip_cm": p_open_dip, "closing_dip_cm": p_close_dip,
                     "opening_volume_liters": round(p_open_dip * 785.4, 0),
                     "closing_volume_liters": round(p_close_dip * 785.4, 0),
                     "recorded_at": f"{day_str}T{'18' if shift_type == 'Day' else '06'}:00:00", "recorded_by": "system"},
                ],
            }

            # ── Handovers ──
            diesel_summaries = [s for s in nozzle_summaries if s["fuel_type"] == "Diesel"]
            petrol_summaries = [s for s in nozzle_summaries if s["fuel_type"] == "Petrol"]

            for att_info, att_nozzles, cash_diff, fuel_label in [
                (diesel_att, diesel_summaries, cash_diff_d, "diesel"),
                (petrol_att, petrol_summaries, cash_diff_p, "petrol"),
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
                    "date": day_str, "shift_type": shift_type,
                    "nozzle_summaries": att_nozzles,
                    "fuel_revenue": att_rev,
                    "lpg_sales": 0, "lubricant_sales": 0, "accessory_sales": 0,
                    "total_expected": att_rev, "credit_sales": 0,
                    "expected_cash": att_rev, "actual_cash": att_actual,
                    "difference": round(cash_diff, 2),
                    "status": "submitted", "review_status": "approved",
                    "supervisor_review": {
                        "reviewed_by": "STF001", "reviewed_by_name": "Herve Renard",
                        "reviewed_at": f"{day_str}T{'19' if shift_type == 'Day' else '07'}:00:00",
                        "action": "approve", "note": "Approved",
                    },
                    "auto_flag_reasons": flags if flags else None,
                    "notes": f"Deviation noted on {deviation_nozzle}" if deviation_nozzle and any(n["meter_deviation_flagged"] for n in att_nozzles) else "",
                    "created_at": f"{day_str}T{'18' if shift_type == 'Day' else '06'}:00:00",
                }

            # ── Safe deposits ──
            if sid not in safe_deposits:
                safe_deposits[sid] = {"shift_id": sid, "deposits": []}

            for att_info, att_nozzles, dep_label in [
                (diesel_att, diesel_summaries, "diesel"),
                (petrol_att, petrol_summaries, "petrol"),
            ]:
                att_rev = sum(n["revenue"] for n in att_nozzles)
                if shift_type == "Day":
                    if day_num in overdue_deposit_days and dep_label == "petrol":
                        # Overdue gap: deposit at 08:00 then next at 14:00 (6hr gap)
                        dep_times = ["08:00", "14:00", "17:00"]
                    else:
                        dep_times = ["08:00", "10:30", "13:00", "16:00"]
                else:
                    dep_times = ["19:00", "22:00"]

                for dt in dep_times:
                    safe_deposits[sid]["deposits"].append({
                        "deposit_id": f"DEP-{uuid.uuid4().hex[:8]}",
                        "attendant_id": att_info["id"], "attendant_name": att_info["name"],
                        "amount": round(att_rev / len(dep_times), 0),
                        "time": dt,
                        "timestamp": f"{day_str}T{dt}:00",
                        "recorded_at": f"{day_str}T{dt}:00",
                        "note": "",
                    })

            if not scenarios:
                scenarios.append("Clean")

            scenario_log.append(f"  {sid:20s} | {scenarios[0]:40s} | D:{total_d:.0f}L  P:{total_p:.0f}L")

        current += timedelta(days=1)

    # ── SAVE TO DATABASE ──────────────────────────────
    logger.info(f"\nGenerated {shift_count} shifts across {total_days} days")
    logger.info(f"Readings: {len(readings)}")
    logger.info(f"Handovers: {len(handovers)}")
    total_deposits = sum(len(d["deposits"]) for d in safe_deposits.values())
    logger.info(f"Safe deposits: {total_deposits}")
    logger.info(f"Deliveries: {len(delivery_history)}")

    logger.info("\nSaving to database...")

    storage['shifts'] = shifts
    storage['readings'] = readings
    storage['delivery_history'] = delivery_history

    data_size = len(json.dumps(storage))
    logger.info(f"  Storage payload: {data_size} bytes ({data_size/1024/1024:.2f} MB)")

    try:
        conn.execute(
            "UPDATE station_storage SET data = %s, updated_at = NOW() WHERE station_id = 'ST001'",
            (Jsonb(storage),)
        )
        logger.info("  station_storage updated ✓")
    except Exception as e:
        logger.error(f"  FAILED to save storage: {e}")
        sys.exit(1)

    try:
        conn.execute("""
            INSERT INTO station_files (station_id, filename, data, updated_at)
            VALUES ('ST001', 'attendant_handovers.json', %s, NOW())
            ON CONFLICT (station_id, filename)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        """, (Jsonb(handovers),))
        logger.info("  handovers saved ✓")
    except Exception as e:
        logger.error(f"  FAILED to save handovers: {e}")

    try:
        conn.execute("""
            INSERT INTO station_files (station_id, filename, data, updated_at)
            VALUES ('ST001', 'safe_deposits.json', %s, NOW())
            ON CONFLICT (station_id, filename)
            DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        """, (Jsonb(safe_deposits),))
        logger.info("  safe_deposits saved ✓")
    except Exception as e:
        logger.error(f"  FAILED to save deposits: {e}")

    # Verify
    row = conn.execute("SELECT data FROM station_storage WHERE station_id = 'ST001'").fetchone()
    v = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    logger.info(f"\n  VERIFY: {len(v.get('readings',[]))} readings, {len(v.get('shifts',{}))} shifts in DB")
    logger.info(f"  VERIFY: diesel_price={v.get('settings',{}).get('diesel_price_per_liter')}, petrol_price={v.get('settings',{}).get('petrol_price_per_liter')}")

    conn.close()

    logger.info("\n" + "=" * 60)
    logger.info("  SIMULATION DATA SEEDED SUCCESSFULLY")
    logger.info("=" * 60)
    logger.info(f"\n  Period:        {START_DATE} to {END_DATE} ({total_days} days)")
    logger.info(f"  Shifts:        {shift_count}")
    logger.info(f"  Readings:      {len(readings)}")
    logger.info(f"  Handovers:     {len(handovers)}")
    logger.info(f"  Safe deposits: {total_deposits}")
    logger.info(f"  Deliveries:    {len(delivery_history)}")
    logger.info(f"  Diesel price:  K{DIESEL_PRICE}/L")
    logger.info(f"  Petrol price:  K{PETROL_PRICE}/L")

    logger.info("\nSCENARIO DISTRIBUTION:")
    logger.info(f"  Cash shortages:       {len(shortage_days)} days")
    logger.info(f"  Cash surpluses:       {len(surplus_days)} days")
    logger.info(f"  Meter deviations:     {len(deviation_days)} days")
    logger.info(f"  Nozzle losses:        {len(loss_days)} days")
    logger.info(f"  Multi-delivery:       {len(multi_delivery_days)} days")
    logger.info(f"  Overdue deposits:     {len(overdue_deposit_days)} days")
    logger.info(f"  Clean shifts:         remainder")

    logger.info("\nSHIFT LOG (sample):")
    for line in scenario_log[:10]:
        logger.info(line)
    logger.info("  ...")
    for line in scenario_log[-5:]:
        logger.info(line)

    logger.info("\nRestart the backend service, then check all reports.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
