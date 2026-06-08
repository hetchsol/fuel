"""
Shared handover-sales loader (single source of truth for "sales from handovers").

Both the Advanced Reports API (reports.py) and the Sales Reports API
(sales_reports.py) flatten completed attendant handovers into per-nozzle sale
records. They previously each reimplemented the load + phase filter + nozzle
iteration. This module holds that one shared core; each caller still builds its
own record shape on top, so their outputs are unchanged.
"""
from ..database.station_files import load_station_json


def iter_completed_handover_nozzles(station_id: str):
    """Yield (handover, nozzle_summary) for every nozzle summary on every
    completed handover (phase=='completed'). The single place that loads
    attendant_handovers.json and applies the completed-phase filter."""
    handovers = load_station_json(station_id, 'attendant_handovers.json', default={})
    for ho in handovers.values():
        if ho.get('phase', 'completed') != 'completed':
            continue
        for ns in ho.get('nozzle_summaries', []):
            yield ho, ns


def build_nozzle_island_lookup(storage: dict) -> dict:
    """Map nozzle_id -> island_id from station storage islands."""
    lookup = {}
    for island_id, island in (storage.get('islands') or {}).items():
        ps = island.get('pump_station')
        if ps:
            for nozzle in ps.get('nozzles', []):
                lookup[nozzle.get('nozzle_id')] = island_id
    return lookup
