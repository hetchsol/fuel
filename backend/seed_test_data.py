"""
Comprehensive Test Data Seeder for Tank Readings & Deliveries

Generates 14 days of data (2026-02-01 to 2026-02-14) for both Diesel and Petrol tanks,
covering every scenario:

  Day  1  D-Day   : Normal PASS, no delivery, no issues
  Day  1  D-Night : Small positive variance (WARNING)
  Day  2  D-Day   : Single delivery mid-shift, VAT calculated
  Day  2  D-Night : Exact match (PASS, zero variance)
  Day  3  D-Day   : Loss scenario – tank shows more consumed than nozzles (negative variance, FAIL)
  Day  3  D-Night : Over-read nozzles – nozzles > tank (positive variance, WARNING)
  Day  4  D-Day   : Multiple deliveries (2), VAT on combined volume
  Day  4  D-Night : Large single delivery, high cash surplus
  Day  5  D-Day   : Very high volume day, customer allocations (Diesel)
  Day  5  D-Night : Low volume night, near-zero movement
  Day  6  D-Day   : Triple delivery scenario, mixed variances
  Day  6  D-Night : Cash shortage (actual < expected)
  Day  7  D-Day   : Critical loss FAIL (>2% negative variance)
  Day  7  D-Night : Recovery shift, PASS with delivery

Petrol mirrors diesel with its own realistic numbers (different price, different nozzles 4A/4B/5A/5B).

Running totals accumulate correctly across all shifts.
"""

import json
import os
import copy
from datetime import datetime

STATION_ID = "ST001"
BASE_DIR = os.path.join(os.path.dirname(__file__), "storage", "stations", STATION_ID)

DIESEL_PRICE = 26.98
PETROL_PRICE = 29.92
VAT_RATE = 0.16
FUEL_LEVY = 1.44
VAT_DIVISOR = 1.16

# Nozzle base counters (cumulative meter readings)
DIESEL_NOZZLES = {
    "1A": {"attendant": "Chileshe", "elec": 200000.0, "mech": 270000.0},
    "1B": {"attendant": "Chileshe", "elec": 205000.0, "mech": 275000.0},
    "2A": {"attendant": "Mwamba",   "elec": 430000.0, "mech": 430000.0},
    "2B": {"attendant": "Mwamba",   "elec": 610000.0, "mech": 610000.0},
}

PETROL_NOZZLES = {
    "4A": {"attendant": "Banda",    "elec": 150000.0, "mech": 150000.0},
    "4B": {"attendant": "Banda",    "elec": 160000.0, "mech": 160000.0},
    "5A": {"attendant": "Mutale",   "elec": 300000.0, "mech": 300000.0},
    "5B": {"attendant": "Mutale",   "elec": 320000.0, "mech": 320000.0},
}


def calc_vat(delivery_volume, price):
    if delivery_volume <= 0 or price <= 0:
        return None, None, None
    net = (price - FUEL_LEVY) / VAT_DIVISOR
    vat_amount = round(delivery_volume * net * VAT_RATE, 2)
    return round(vat_amount, 2), round(net, 4), round(net * VAT_RATE, 4)


def make_nozzle_readings(nozzle_state, movements):
    """
    movements: dict of nozzle_id -> (elec_movement, mech_movement)
    Updates nozzle_state in place and returns list of NozzleReadingDetail dicts.
    """
    readings = []
    for nid, (e_mov, m_mov) in movements.items():
        ns = nozzle_state[nid]
        e_open = ns["elec"]
        m_open = ns["mech"]
        e_close = round(e_open + e_mov, 3)
        m_close = round(m_open + m_mov, 3)
        readings.append({
            "nozzle_id": nid,
            "attendant": ns["attendant"],
            "electronic_opening": e_open,
            "electronic_closing": e_close,
            "electronic_movement": round(e_mov, 3),
            "mechanical_opening": m_open,
            "mechanical_closing": m_close,
            "mechanical_movement": round(m_mov, 3),
        })
        ns["elec"] = e_close
        ns["mech"] = m_close
    return readings


def make_reconciliation(tank_movement, total_elec, total_mech, price, actual_cash):
    elec_cash = round(total_elec * price, 2)
    nozzle_var = round(tank_movement - total_elec, 2)
    var_pct = round(abs(nozzle_var) / tank_movement * 100, 2) if tank_movement else 0
    status = "BALANCED" if var_pct <= 0.5 else ("DISCREPANCY_WARNING" if var_pct <= 1.0 else "DISCREPANCY_CRITICAL")
    return {
        "sources": {
            "physical": {"tank_movement_liters": tank_movement, "expected_cash": round(tank_movement * price, 2)},
            "operational": {"nozzle_sales_liters": total_elec, "expected_cash": elec_cash},
            "financial": {
                "actual_cash": actual_cash,
                "equivalent_liters": round(actual_cash / price, 2) if actual_cash and price else None
            }
        },
        "variances": {
            "tank_vs_nozzle": {
                "variance_liters": round(abs(nozzle_var), 2),
                "variance_cash": round(abs(nozzle_var) * price, 2),
                "variance_percent": var_pct,
                "status": "OK" if var_pct <= 0.5 else ("WARNING" if var_pct <= 1.0 else "CRITICAL")
            }
        },
        "status": status,
        "root_cause_analysis": None,
        "recommendations": [],
        "tolerance_levels": {}
    }


def build_reading(
    tank_id, fuel_type, date, shift_type, price,
    opening_dip, closing_dip, opening_vol, closing_vol,
    nozzle_readings, deliveries=None,
    before_offload=None, after_offload=None, after_delivery_dip=None,
    actual_cash=None, customer_allocations=None, notes=None,
    running_totals=None,
):
    """Build a complete TankVolumeReadingOutput dict."""
    total_elec = sum(n["electronic_movement"] for n in nozzle_readings)
    total_mech = sum(n["mechanical_movement"] for n in nozzle_readings)

    deliveries = deliveries or []
    total_del_vol = sum(d["volume_delivered"] for d in deliveries)
    tank_movement = round((opening_vol - closing_vol) + total_del_vol, 2)

    elec_var = round(total_elec - tank_movement, 2)
    mech_var = round(total_mech - tank_movement, 2)
    elec_pct = round((elec_var / tank_movement) * 100, 4) if tank_movement else 0
    mech_pct = round((mech_var / tank_movement) * 100, 4) if tank_movement else 0

    expected_elec = round(total_elec * price, 2)
    expected_mech = round(total_mech * price, 2)
    cash_diff = round(actual_cash - expected_elec, 2) if actual_cash is not None else None
    cumulative_vol_sold = round((total_elec + total_mech) / 2, 2)
    loss_pct = round(elec_pct, 4)

    # Determine status
    abs_elec_pct = abs(elec_pct)
    if abs_elec_pct <= 0.5:
        validation_status = "PASS"
    elif abs_elec_pct <= 1.0:
        validation_status = "WARNING"
    else:
        validation_status = "FAIL"
    has_discrepancy = abs_elec_pct > 0.5

    # VAT
    vat_amount, net_price, vat_per_liter = calc_vat(total_del_vol, price)

    # Running totals
    rt = running_totals or {}
    prev_rt_vol = rt.get("running_total_volume_sold", 0.0)
    prev_rt_var = rt.get("running_total_variance", 0.0)
    prev_rt_tm = rt.get("running_total_tank_movement", 0.0)

    new_rt_vol = round(prev_rt_vol + cumulative_vol_sold, 2)
    new_rt_var = round(prev_rt_var + elec_var, 2)
    new_rt_tm = round(prev_rt_tm + tank_movement, 2)
    new_rt_loss = round((new_rt_var / new_rt_tm) * 100, 4) if new_rt_tm else 0.0

    # Pump averages
    pump_groups = {}
    for n in nozzle_readings:
        pnum = n["nozzle_id"][0]
        pump_groups.setdefault(pnum, 0.0)
        pump_groups[pnum] += (n["electronic_movement"] + n["mechanical_movement"]) / 2
    pump_averages = {
        f"pump_{p}": {"volume_liters": round(v, 2), "amount_zmw": round(v * price, 2)}
        for p, v in pump_groups.items()
    }

    # Customer allocations
    alloc_balance = None
    total_cust_rev = None
    if customer_allocations:
        alloc_total_vol = sum(a["volume"] for a in customer_allocations)
        alloc_balance = round(total_elec - alloc_total_vol, 3)
        total_cust_rev = round(sum(a["amount"] for a in customer_allocations), 2)

    reading_id = f"TR-{tank_id}-{date}-{shift_type[0].lower()}{abs(hash(date + shift_type + tank_id)) % 0xFFFFFF:06x}"

    # Delivery references for output
    delivery_refs = []
    for d in deliveries:
        delivery_refs.append({
            "delivery_id": d.get("delivery_id"),
            "volume_delivered": d["volume_delivered"],
            "delivery_time": d["delivery_time"],
            "supplier": d["supplier"],
            "invoice_number": d.get("invoice_number"),
            "before_volume": d["before_volume"],
            "after_volume": d["after_volume"],
        })

    recon = make_reconciliation(tank_movement, total_elec, total_mech, price, actual_cash)

    reading = {
        "reading_id": reading_id,
        "tank_id": tank_id,
        "fuel_type": fuel_type,
        "date": date,
        "shift_type": shift_type,
        "opening_dip_cm": opening_dip,
        "closing_dip_cm": closing_dip,
        "after_delivery_dip_cm": after_delivery_dip,
        "opening_volume": opening_vol,
        "closing_volume": closing_vol,
        "before_offload_volume": before_offload,
        "after_offload_volume": after_offload,
        "nozzle_readings": nozzle_readings,
        "tank_volume_movement": tank_movement,
        "total_electronic_dispensed": round(total_elec, 3),
        "total_mechanical_dispensed": round(total_mech, 3),
        "electronic_vs_tank_variance": elec_var,
        "mechanical_vs_tank_variance": mech_var,
        "electronic_vs_tank_percent": elec_pct,
        "mechanical_vs_tank_percent": mech_pct,
        "price_per_liter": price,
        "expected_amount_electronic": expected_elec,
        "expected_amount_mechanical": expected_mech,
        "actual_cash_banked": actual_cash,
        "cash_difference": cash_diff,
        "cumulative_volume_sold": cumulative_vol_sold,
        "loss_percent": loss_pct,
        "customer_allocations": customer_allocations or [],
        "allocation_balance_check": alloc_balance,
        "total_customer_revenue": total_cust_rev,
        "delivery_vat_amount": vat_amount,
        "delivery_net_price": net_price,
        "delivery_vat_per_liter": vat_per_liter,
        "running_total_volume_sold": new_rt_vol,
        "running_total_variance": new_rt_var,
        "running_total_tank_movement": new_rt_tm,
        "running_loss_percent": new_rt_loss,
        "pump_averages": pump_averages,
        "deliveries": delivery_refs,
        "total_delivery_volume": total_del_vol,
        "delivery_count": len(deliveries),
        "delivery_timeline": None,
        "reconciliation": recon,
        "delivery_occurred": len(deliveries) > 0,
        "delivery_volume": total_del_vol if total_del_vol > 0 else None,
        "delivery_time": deliveries[0]["delivery_time"] if deliveries else None,
        "supplier": deliveries[0]["supplier"] if deliveries else None,
        "invoice_number": deliveries[0].get("invoice_number") if deliveries else None,
        "validation_status": validation_status,
        "validation_messages": [],
        "has_discrepancy": has_discrepancy,
        "recorded_by": "O001",
        "created_at": f"2026-02-15T08:00:00",
        "notes": notes,
    }

    # Return reading and its running totals for chaining
    new_running = {
        "running_total_volume_sold": new_rt_vol,
        "running_total_variance": new_rt_var,
        "running_total_tank_movement": new_rt_tm,
    }
    return reading, new_running


def make_delivery_record(tank_id, fuel_type, date, time, vol_before, vol_after,
                         supplier, invoice, reading_id=None):
    del_id = f"DEL-{tank_id}-{date}-{abs(hash(date+time+tank_id)) % 0xFFFFFF:06x}"
    actual = round(vol_after - vol_before, 2)
    return {
        "delivery_id": del_id,
        "tank_id": tank_id,
        "fuel_type": fuel_type,
        "date": date,
        "time": time,
        "volume_before": vol_before,
        "volume_after": vol_after,
        "actual_volume_delivered": actual,
        "expected_volume": actual,
        "delivery_variance": 0.0,
        "variance_percent": 0.0,
        "supplier": supplier,
        "invoice_number": invoice,
        "temperature": None,
        "validation_status": "PASS",
        "validation_message": "Delivery recorded successfully",
        "linked_reading_id": reading_id,
        "recorded_by": "O001",
        "created_at": "2026-02-15T08:00:00",
        "notes": None,
    }


def generate_all():
    readings_db = {}
    deliveries_db = {}

    # Deep copy nozzle state so we can mutate
    d_nozzles = {k: dict(v) for k, v in DIESEL_NOZZLES.items()}
    p_nozzles = {k: dict(v) for k, v in PETROL_NOZZLES.items()}

    # Running totals trackers
    d_rt = {}
    p_rt = {}

    # Tank levels (start)
    d_vol = 18000.0  # Diesel opening volume
    p_vol = 20000.0  # Petrol opening volume

    # =====================================================================
    # DAY 1 (2026-02-01) — NORMAL / SMALL WARNING
    # =====================================================================
    date = "2026-02-01"

    # Diesel Day: Normal PASS — nozzles closely match tank
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (280.5, 280.0), "1B": (350.2, 350.0),
        "2A": (190.8, 191.0), "2B": (210.3, 210.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 2.0, 2)  # tank shows 2L more consumed (tiny loss)
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE * 0.998, 2),
        notes="Normal day shift - slight tank loss within tolerance",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Diesel Night: Small positive variance (WARNING ~0.7%)
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (220.0, 219.5), "1B": (180.0, 180.0),
        "2A": (150.0, 150.5), "2B": (130.0, 130.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec + 5.0, 2)  # tank shows 5L less consumed → positive variance
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Night shift - nozzles read slightly higher than tank (calibration?)",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Day: Normal PASS
    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (310.0, 310.0), "4B": (290.0, 289.5),
        "5A": (270.0, 270.5), "5B": (250.0, 250.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec - 1.5, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Day", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * PETROL_PRICE * 1.001, 2),
        notes="Normal petrol day shift",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Night: PASS
    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (200.0, 200.0), "4B": (180.0, 180.0),
        "5A": (160.0, 160.0), "5B": (140.0, 140.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec - 0.5, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Night", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz,
        notes="Normal petrol night shift",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 2 (2026-02-02) — SINGLE DELIVERY / EXACT MATCH
    # =====================================================================
    date = "2026-02-02"

    # Diesel Day: Single delivery of 15,000L mid-shift, VAT calculated
    d_open = d_vol
    d_before_del = round(d_open - 400, 2)  # sold 400L before delivery
    d_after_del = round(d_before_del + 15000, 2)
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (300.0, 300.0), "1B": (380.0, 380.0),
        "2A": (200.0, 200.0), "2B": (250.0, 250.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_after_del - (total_nz_elec - 400) - 3.0, 2)  # 400L already counted before delivery
    d_vol = d_close

    del1 = {
        "delivery_id": None, "volume_delivered": 15000.0,
        "delivery_time": "10:30", "supplier": "TotalEnergies",
        "invoice_number": "INV-2026-0201", "before_volume": d_before_del,
        "after_volume": d_after_del,
    }
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, deliveries=[del1],
        before_offload=d_before_del, after_offload=d_after_del,
        after_delivery_dip=round(d_after_del/785.4, 1),
        actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Single delivery - 15,000L from TotalEnergies",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r
    # Store delivery record
    dr = make_delivery_record("TANK-DIESEL", "Diesel", date, "10:30",
        d_before_del, d_after_del, "TotalEnergies", "INV-2026-0201", r["reading_id"])
    deliveries_db[dr["delivery_id"]] = dr

    # Diesel Night: Exact match (PASS, ~0% variance)
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (250.0, 250.0), "1B": (300.0, 300.0),
        "2A": (180.0, 180.0), "2B": (200.0, 200.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec, 2)  # exact match
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Perfect match - zero variance",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Day: Single delivery 12,000L
    p_open = p_vol
    p_before = round(p_open - 300, 2)
    p_after = round(p_before + 12000, 2)
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (280.0, 280.0), "4B": (260.0, 260.0),
        "5A": (240.0, 240.0), "5B": (220.0, 220.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_after - (total_nz_elec - 300) - 2.0, 2)
    p_vol = p_close

    del_p1 = {
        "delivery_id": None, "volume_delivered": 12000.0,
        "delivery_time": "09:15", "supplier": "Puma Energy",
        "invoice_number": "PE-2026-0088", "before_volume": p_before,
        "after_volume": p_after,
    }
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Day", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz, deliveries=[del_p1],
        actual_cash=round(total_nz_elec * PETROL_PRICE, 2),
        notes="Petrol delivery 12,000L from Puma Energy",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r
    dr = make_delivery_record("TANK-PETROL", "Petrol", date, "09:15",
        p_before, p_after, "Puma Energy", "PE-2026-0088", r["reading_id"])
    deliveries_db[dr["delivery_id"]] = dr

    # Petrol Night
    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (190.0, 190.0), "4B": (170.0, 170.0),
        "5A": (150.0, 150.0), "5B": (130.0, 130.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec - 1.0, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Night", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz,
        notes="Petrol night - normal",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 3 (2026-02-03) — LOSS SCENARIO / OVER-READ
    # =====================================================================
    date = "2026-02-03"

    # Diesel Day: LOSS — tank consumed 50L more than nozzles show (FAIL, ~4% negative variance)
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (260.0, 260.0), "1B": (320.0, 320.0),
        "2A": (170.0, 170.0), "2B": (220.0, 220.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 50.0, 2)  # 50L unexplained loss
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="LOSS DETECTED - 50L unaccounted for. Check for leaks or theft.",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Diesel Night: OVER-READ — nozzles show 8L more than tank (WARNING, positive variance)
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (200.0, 199.0), "1B": (160.0, 159.0),
        "2A": (140.0, 139.0), "2B": (120.0, 119.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec + 8.0, 2)  # tank shows less consumed
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE * 1.01, 2),
        notes="Nozzle over-read - possible meter calibration issue",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Day: Loss scenario
    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (300.0, 300.0), "4B": (280.0, 280.0),
        "5A": (250.0, 250.0), "5B": (230.0, 230.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec - 35.0, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Day", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * PETROL_PRICE, 2),
        notes="Petrol loss - 35L unaccounted",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Night
    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (180.0, 180.0), "4B": (160.0, 160.0),
        "5A": (140.0, 140.0), "5B": (120.0, 120.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec + 3.0, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Night", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz,
        notes="Petrol night - slight over-read",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 4 (2026-02-04) — MULTI DELIVERY / LARGE DELIVERY + CASH SURPLUS
    # =====================================================================
    date = "2026-02-04"

    # Diesel Day: TWO deliveries (8,000L + 7,000L)
    d_open = d_vol
    d_before1 = round(d_open - 200, 2)  # sold 200L before first delivery
    d_after1 = round(d_before1 + 8000, 2)
    d_before2 = round(d_after1 - 300, 2)  # sold 300L between deliveries
    d_after2 = round(d_before2 + 7000, 2)

    nz = make_nozzle_readings(d_nozzles, {
        "1A": (310.0, 310.0), "1B": (370.0, 370.0),
        "2A": (210.0, 210.0), "2B": (260.0, 260.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_after2 - (total_nz_elec - 500) - 4.0, 2)  # 500L already sold before/between
    d_vol = d_close

    del_d1 = {
        "delivery_id": None, "volume_delivered": 8000.0,
        "delivery_time": "08:45", "supplier": "TotalEnergies",
        "invoice_number": "INV-2026-0204A", "before_volume": d_before1,
        "after_volume": d_after1,
    }
    del_d2 = {
        "delivery_id": None, "volume_delivered": 7000.0,
        "delivery_time": "14:30", "supplier": "Engen",
        "invoice_number": "INV-2026-0204B", "before_volume": d_before2,
        "after_volume": d_after2,
    }
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, deliveries=[del_d1, del_d2],
        actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Double delivery day - 8,000L + 7,000L from two suppliers",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r
    for i, d in enumerate([
        ("08:45", d_before1, d_after1, "TotalEnergies", "INV-2026-0204A"),
        ("14:30", d_before2, d_after2, "Engen", "INV-2026-0204B"),
    ]):
        dr = make_delivery_record("TANK-DIESEL", "Diesel", date, d[0], d[1], d[2], d[3], d[4], r["reading_id"])
        deliveries_db[dr["delivery_id"]] = dr

    # Diesel Night: Large delivery 20,000L + cash surplus
    d_open = d_vol
    d_before = round(d_open - 150, 2)
    d_after = round(d_before + 20000, 2)
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (230.0, 230.0), "1B": (190.0, 190.0),
        "2A": (160.0, 160.0), "2B": (140.0, 140.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_after - (total_nz_elec - 150) - 1.0, 2)
    d_vol = d_close

    del_big = {
        "delivery_id": None, "volume_delivered": 20000.0,
        "delivery_time": "19:00", "supplier": "Oryx Energies",
        "invoice_number": "ORX-2026-0440", "before_volume": d_before,
        "after_volume": d_after,
    }
    cash_surplus = round(total_nz_elec * DIESEL_PRICE * 1.03, 2)  # 3% cash surplus
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, deliveries=[del_big],
        actual_cash=cash_surplus,
        notes="Large 20,000L delivery + cash surplus (rounding from previous shifts?)",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r
    dr = make_delivery_record("TANK-DIESEL", "Diesel", date, "19:00",
        d_before, d_after, "Oryx Energies", "ORX-2026-0440", r["reading_id"])
    deliveries_db[dr["delivery_id"]] = dr

    # Petrol Day & Night for Day 4 (multi-delivery petrol)
    p_open = p_vol
    p_b1 = round(p_open - 250, 2)
    p_a1 = round(p_b1 + 10000, 2)
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (320.0, 320.0), "4B": (300.0, 300.0),
        "5A": (280.0, 280.0), "5B": (260.0, 260.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_a1 - (total_nz_elec - 250) - 2.0, 2)
    p_vol = p_close
    del_p = {
        "delivery_id": None, "volume_delivered": 10000.0,
        "delivery_time": "11:00", "supplier": "Puma Energy",
        "invoice_number": "PE-2026-0102", "before_volume": p_b1, "after_volume": p_a1,
    }
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Day", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz, deliveries=[del_p],
        actual_cash=round(total_nz_elec * PETROL_PRICE, 2),
        notes="Petrol delivery 10,000L",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r
    dr = make_delivery_record("TANK-PETROL", "Petrol", date, "11:00",
        p_b1, p_a1, "Puma Energy", "PE-2026-0102", r["reading_id"])
    deliveries_db[dr["delivery_id"]] = dr

    p_open = p_vol
    nz = make_nozzle_readings(p_nozzles, {
        "4A": (170.0, 170.0), "4B": (150.0, 150.0),
        "5A": (130.0, 130.0), "5B": (110.0, 110.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    p_close = round(p_open - total_nz_elec - 1.0, 2)
    p_vol = p_close
    r, p_rt = build_reading("TANK-PETROL", "Petrol", date, "Night", PETROL_PRICE,
        opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
        opening_vol=p_open, closing_vol=p_close,
        nozzle_readings=nz,
        notes="Petrol night - normal",
        running_totals=p_rt)
    readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 5 (2026-02-05) — HIGH VOLUME + ALLOCATIONS / LOW VOLUME
    # =====================================================================
    date = "2026-02-05"

    # Diesel Day: Very high volume with customer allocations
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (450.0, 450.0), "1B": (520.0, 520.0),
        "2A": (380.0, 380.0), "2B": (410.0, 410.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 3.0, 2)
    d_vol = d_close

    allocations = [
        {"customer_id": "CUST-DRIVE-IN", "customer_name": "Drive-In Customers",
         "volume": round(total_nz_elec * 0.45, 3), "price_per_liter": DIESEL_PRICE,
         "amount": round(total_nz_elec * 0.45 * DIESEL_PRICE, 2)},
        {"customer_id": "CUST-KAFUBU", "customer_name": "Kafubu Water",
         "volume": round(total_nz_elec * 0.20, 3), "price_per_liter": 25.50,
         "amount": round(total_nz_elec * 0.20 * 25.50, 2)},
        {"customer_id": "CUST-POLICE", "customer_name": "Zambia Police",
         "volume": round(total_nz_elec * 0.15, 3), "price_per_liter": 26.00,
         "amount": round(total_nz_elec * 0.15 * 26.00, 2)},
        {"customer_id": "CUST-GENSET", "customer_name": "Genset Operations",
         "volume": round(total_nz_elec * 0.20, 3), "price_per_liter": DIESEL_PRICE,
         "amount": round(total_nz_elec * 0.20 * DIESEL_PRICE, 2)},
    ]
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        customer_allocations=allocations,
        notes="High volume day with full customer allocation breakdown",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Diesel Night: Very low volume
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (45.0, 45.0), "1B": (38.0, 38.0),
        "2A": (30.0, 30.0), "2B": (25.0, 25.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 0.5, 2)
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz,
        notes="Low volume night - minimal activity",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Day & Night for Day 5
    for shift, movs, note in [
        ("Day", {"4A": (350.0, 350.0), "4B": (330.0, 330.0), "5A": (310.0, 310.0), "5B": (290.0, 290.0)}, "High volume petrol day"),
        ("Night", {"4A": (80.0, 80.0), "4B": (70.0, 70.0), "5A": (60.0, 60.0), "5B": (50.0, 50.0)}, "Low volume petrol night"),
    ]:
        p_open = p_vol
        nz = make_nozzle_readings(p_nozzles, movs)
        total_nz_elec = sum(n["electronic_movement"] for n in nz)
        p_close = round(p_open - total_nz_elec - 1.5, 2)
        p_vol = p_close
        r, p_rt = build_reading("TANK-PETROL", "Petrol", date, shift, PETROL_PRICE,
            opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
            opening_vol=p_open, closing_vol=p_close,
            nozzle_readings=nz,
            notes=note,
            running_totals=p_rt)
        readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 6 (2026-02-06) — TRIPLE DELIVERY / CASH SHORTAGE
    # =====================================================================
    date = "2026-02-06"

    # Diesel Day: THREE deliveries (5000 + 5000 + 5000)
    d_open = d_vol
    dels = []
    vol_cursor = d_open
    for i, (time, sup, inv, qty) in enumerate([
        ("07:30", "TotalEnergies", "TE-0301", 5000),
        ("11:00", "Engen", "EN-0301", 5000),
        ("15:30", "Oryx Energies", "OX-0301", 5000),
    ]):
        bv = round(vol_cursor - (80 * (i + 1)), 2)
        av = round(bv + qty, 2)
        dels.append({
            "delivery_id": None, "volume_delivered": float(qty),
            "delivery_time": time, "supplier": sup,
            "invoice_number": inv, "before_volume": bv, "after_volume": av,
        })
        vol_cursor = av

    nz = make_nozzle_readings(d_nozzles, {
        "1A": (340.0, 340.0), "1B": (400.0, 400.0),
        "2A": (230.0, 230.0), "2B": (280.0, 280.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(vol_cursor - (total_nz_elec - 240) - 5.0, 2)
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, deliveries=dels,
        actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Triple delivery day - 3x 5,000L from three suppliers",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r
    for d in dels:
        dr = make_delivery_record("TANK-DIESEL", "Diesel", date, d["delivery_time"],
            d["before_volume"], d["after_volume"], d["supplier"], d["invoice_number"], r["reading_id"])
        deliveries_db[dr["delivery_id"]] = dr

    # Diesel Night: Cash shortage
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (210.0, 210.0), "1B": (170.0, 170.0),
        "2A": (150.0, 150.0), "2B": (130.0, 130.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 2.0, 2)
    d_vol = d_close
    expected_cash = round(total_nz_elec * DIESEL_PRICE, 2)
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz,
        actual_cash=round(expected_cash * 0.92, 2),  # 8% cash shortage
        notes="Cash shortage - attendant may owe money",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Petrol Day & Night
    for shift, movs, delta, note in [
        ("Day", {"4A": (290.0, 290.0), "4B": (270.0, 270.0), "5A": (250.0, 250.0), "5B": (230.0, 230.0)}, -2.0, "Petrol day"),
        ("Night", {"4A": (160.0, 160.0), "4B": (140.0, 140.0), "5A": (120.0, 120.0), "5B": (100.0, 100.0)}, -1.0, "Petrol night"),
    ]:
        p_open = p_vol
        nz = make_nozzle_readings(p_nozzles, movs)
        total_nz_elec = sum(n["electronic_movement"] for n in nz)
        p_close = round(p_open - total_nz_elec + delta, 2)
        p_vol = p_close
        r, p_rt = build_reading("TANK-PETROL", "Petrol", date, shift, PETROL_PRICE,
            opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
            opening_vol=p_open, closing_vol=p_close,
            nozzle_readings=nz,
            notes=note,
            running_totals=p_rt)
        readings_db[r["reading_id"]] = r

    # =====================================================================
    # DAY 7 (2026-02-07) — CRITICAL LOSS / RECOVERY
    # =====================================================================
    date = "2026-02-07"

    # Diesel Day: Critical loss FAIL (>2% negative variance, ~80L missing)
    d_open = d_vol
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (290.0, 290.0), "1B": (350.0, 350.0),
        "2A": (200.0, 200.0), "2B": (240.0, 240.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_open - total_nz_elec - 80.0, 2)  # 80L unaccounted loss!
    d_vol = d_close
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Day", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="CRITICAL LOSS - 80L missing. Possible underground leak. Investigation required.",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r

    # Diesel Night: Recovery with delivery, back to PASS
    d_open = d_vol
    d_before = round(d_open - 100, 2)
    d_after = round(d_before + 18000, 2)
    nz = make_nozzle_readings(d_nozzles, {
        "1A": (200.0, 200.0), "1B": (240.0, 240.0),
        "2A": (160.0, 160.0), "2B": (180.0, 180.0),
    })
    total_nz_elec = sum(n["electronic_movement"] for n in nz)
    d_close = round(d_after - (total_nz_elec - 100) - 1.5, 2)
    d_vol = d_close

    del_recovery = {
        "delivery_id": None, "volume_delivered": 18000.0,
        "delivery_time": "20:00", "supplier": "TotalEnergies",
        "invoice_number": "TE-2026-RECOV", "before_volume": d_before,
        "after_volume": d_after,
    }
    r, d_rt = build_reading("TANK-DIESEL", "Diesel", date, "Night", DIESEL_PRICE,
        opening_dip=round(d_open/785.4, 1), closing_dip=round(d_close/785.4, 1),
        opening_vol=d_open, closing_vol=d_close,
        nozzle_readings=nz, deliveries=[del_recovery],
        actual_cash=round(total_nz_elec * DIESEL_PRICE, 2),
        notes="Recovery shift - 18,000L delivery, readings back to normal",
        running_totals=d_rt)
    readings_db[r["reading_id"]] = r
    dr = make_delivery_record("TANK-DIESEL", "Diesel", date, "20:00",
        d_before, d_after, "TotalEnergies", "TE-2026-RECOV", r["reading_id"])
    deliveries_db[dr["delivery_id"]] = dr

    # Petrol Day & Night for Day 7
    for shift, movs, delta, note in [
        ("Day", {"4A": (270.0, 270.0), "4B": (250.0, 250.0), "5A": (230.0, 230.0), "5B": (210.0, 210.0)}, -60.0, "Petrol loss day - 60L missing"),
        ("Night", {"4A": (150.0, 150.0), "4B": (130.0, 130.0), "5A": (110.0, 110.0), "5B": (100.0, 100.0)}, -1.0, "Petrol recovery night"),
    ]:
        p_open = p_vol
        nz = make_nozzle_readings(p_nozzles, movs)
        total_nz_elec = sum(n["electronic_movement"] for n in nz)
        p_close = round(p_open - total_nz_elec + delta, 2)
        p_vol = p_close
        r, p_rt = build_reading("TANK-PETROL", "Petrol", date, shift, PETROL_PRICE,
            opening_dip=round(p_open/785.4, 1), closing_dip=round(p_close/785.4, 1),
            opening_vol=p_open, closing_vol=p_close,
            nozzle_readings=nz,
            notes=note,
            running_totals=p_rt)
        readings_db[r["reading_id"]] = r

    # =====================================================================
    # Print summary
    # =====================================================================
    print(f"\nGenerated {len(readings_db)} tank readings")
    print(f"Generated {len(deliveries_db)} delivery records")

    diesel_readings = [r for r in readings_db.values() if r["tank_id"] == "TANK-DIESEL"]
    petrol_readings = [r for r in readings_db.values() if r["tank_id"] == "TANK-PETROL"]
    print(f"  Diesel readings: {len(diesel_readings)}")
    print(f"  Petrol readings: {len(petrol_readings)}")

    # Count scenarios
    deliveries_with_vat = [r for r in readings_db.values() if r.get("delivery_vat_amount") and r["delivery_vat_amount"] > 0]
    losses = [r for r in readings_db.values() if r["electronic_vs_tank_variance"] < -10]
    over_reads = [r for r in readings_db.values() if r["electronic_vs_tank_variance"] > 5]
    multi_del = [r for r in readings_db.values() if r["delivery_count"] > 1]
    with_alloc = [r for r in readings_db.values() if r.get("customer_allocations") and len(r["customer_allocations"]) > 0]
    with_cash = [r for r in readings_db.values() if r.get("cash_difference") is not None]
    passes = [r for r in readings_db.values() if r["validation_status"] == "PASS"]
    warnings = [r for r in readings_db.values() if r["validation_status"] == "WARNING"]
    fails = [r for r in readings_db.values() if r["validation_status"] == "FAIL"]

    print(f"\nScenario coverage:")
    print(f"  PASS: {len(passes)}, WARNING: {len(warnings)}, FAIL: {len(fails)}")
    print(f"  Deliveries with VAT: {len(deliveries_with_vat)}")
    print(f"  Loss scenarios (>10L): {len(losses)}")
    print(f"  Over-read scenarios: {len(over_reads)}")
    print(f"  Multi-delivery shifts: {len(multi_del)}")
    print(f"  With customer allocations: {len(with_alloc)}")
    print(f"  With cash tracking: {len(with_cash)}")

    # Show running totals for last diesel reading
    last_d = sorted(diesel_readings, key=lambda r: (r["date"], 1 if r["shift_type"]=="Night" else 0))[-1]
    last_p = sorted(petrol_readings, key=lambda r: (r["date"], 1 if r["shift_type"]=="Night" else 0))[-1]
    print(f"\nDiesel cumulative totals (final):")
    print(f"  running_total_volume_sold: {last_d['running_total_volume_sold']}")
    print(f"  running_total_variance: {last_d['running_total_variance']}")
    print(f"  running_total_tank_movement: {last_d['running_total_tank_movement']}")
    print(f"  running_loss_percent: {last_d['running_loss_percent']}%")
    print(f"\nPetrol cumulative totals (final):")
    print(f"  running_total_volume_sold: {last_p['running_total_volume_sold']}")
    print(f"  running_total_variance: {last_p['running_total_variance']}")
    print(f"  running_total_tank_movement: {last_p['running_total_tank_movement']}")
    print(f"  running_loss_percent: {last_p['running_loss_percent']}%")

    return readings_db, deliveries_db


def save_data(readings_db, deliveries_db):
    os.makedirs(BASE_DIR, exist_ok=True)

    readings_path = os.path.join(BASE_DIR, "tank_readings.json")
    deliveries_path = os.path.join(BASE_DIR, "tank_deliveries.json")

    # Back up existing files
    for path in [readings_path, deliveries_path]:
        if os.path.exists(path):
            backup = path + ".bak"
            if os.path.exists(backup):
                os.remove(backup)
            os.rename(path, backup)
            print(f"Backed up {path} -> {backup}")

    with open(readings_path, 'w') as f:
        json.dump(readings_db, f, indent=2, default=str)
    print(f"Wrote {len(readings_db)} readings to {readings_path}")

    with open(deliveries_path, 'w') as f:
        json.dump(deliveries_db, f, indent=2, default=str)
    print(f"Wrote {len(deliveries_db)} deliveries to {deliveries_path}")


if __name__ == "__main__":
    print("=" * 60)
    print("Seeding comprehensive test data for tank readings")
    print("=" * 60)
    readings_db, deliveries_db = generate_all()
    save_data(readings_db, deliveries_db)
    print("\nDone! Restart the backend to pick up new data.")
