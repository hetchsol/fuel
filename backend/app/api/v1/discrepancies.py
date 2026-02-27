"""
Discrepancies / Anomaly Detection API

Aggregates anomaly data from tank readings and variance analysis.
"""

from fastapi import APIRouter, Depends, Query
from datetime import datetime, timedelta
import json
import os

from .auth import require_supervisor_or_owner, get_station_context
from ...services.tank_movement import detect_anomalies
from ...database.station_files import get_station_file

router = APIRouter()


def load_tank_readings(station_id: str) -> dict:
    """Load tank readings from station-specific JSON file"""
    filepath = get_station_file(station_id, 'tank_readings.json')
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


SEVERITY_ORDER = {'CRITICAL': 0, 'WARNING': 1, 'INFO': 2}


@router.get("", dependencies=[Depends(require_supervisor_or_owner)])
def list_discrepancies(
    lookback_days: int = Query(7, ge=1, le=90),
    ctx: dict = Depends(get_station_context),
):
    """
    List detected anomalies across all tanks.

    Iterates every tank in the station, loads recent readings, runs
    anomaly detection, and also flags high-variance readings.
    Results are sorted by severity (CRITICAL first).
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    tanks = storage.get('tanks', {})

    cutoff = (datetime.now() - timedelta(days=lookback_days)).strftime('%Y-%m-%d')

    # Load all tank readings for the station
    all_readings = load_tank_readings(station_id)
    readings_list = list(all_readings.values())

    anomalies = []

    for tank_id, tank_config in tanks.items():
        fuel_type = tank_config.get('fuel_type', 'unknown')

        # Filter readings for this tank within the lookback window
        tank_readings = [
            r for r in readings_list
            if r.get('tank_id') == tank_id and r.get('date', '') >= cutoff
        ]

        if not tank_readings:
            continue

        # Sort by date for detect_anomalies
        tank_readings.sort(key=lambda r: r.get('date', ''))

        # 1) Run anomaly detection (HIGH_CONSUMPTION, LOW_CONSUMPTION, CONSISTENT_LOSS)
        detected = detect_anomalies(tank_readings, lookback_days=lookback_days)
        for a in detected:
            anomalies.append({
                'tank_id': tank_id,
                'fuel_type': fuel_type,
                'date': a.get('date'),
                'type': a['type'],
                'severity': a['severity'],
                'message': a['message'],
                'value': a.get('value'),
            })

        # 2) Check individual readings for high variance
        thresholds = storage.get('validation_thresholds', {})
        warning_threshold = thresholds.get('warning_threshold', 1.0)

        for r in tank_readings:
            variance_pct = abs(r.get('electronic_vs_tank_percent', 0))
            variance_liters = r.get('electronic_vs_tank_variance', 0)

            if variance_pct > warning_threshold and abs(variance_liters) > 20:
                severity = 'CRITICAL' if r.get('validation_status') == 'FAIL' else 'WARNING'
                anomalies.append({
                    'tank_id': tank_id,
                    'fuel_type': fuel_type,
                    'date': r.get('date'),
                    'type': 'HIGH_VARIANCE',
                    'severity': severity,
                    'message': f"Variance of {variance_liters:.2f}L ({variance_pct:.2f}%) exceeds threshold",
                    'value': variance_liters,
                })

    # Sort by severity (CRITICAL first), then by date descending
    anomalies.sort(key=lambda a: (
        SEVERITY_ORDER.get(a['severity'], 9),
        '' if not a.get('date') else a['date'],
    ))
    # Reverse the date part so newest first within same severity
    # Actually sort properly: severity ascending, date descending
    anomalies.sort(key=lambda a: (
        SEVERITY_ORDER.get(a['severity'], 9),
        -(datetime.strptime(a['date'], '%Y-%m-%d').timestamp() if a.get('date') else 0),
    ))

    return anomalies
