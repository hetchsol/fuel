import psycopg, json, os, sys
sys.path.insert(0, '.')
os.environ['DATABASE_URL'] = 'postgresql://fuel_user:fuel_password@localhost:5433/fuel_management'

conn = psycopg.connect('postgresql://fuel_user:fuel_password@localhost:5433/fuel_management')
row = conn.execute(
    "SELECT data FROM station_files WHERE station_id='ST001' AND filename='handovers.json'"
).fetchone()

if not row:
    print('No handovers.json in DB for ST001')
    conn.close()
    exit()

handovers = row[0]
if isinstance(handovers, dict):
    items = list(handovers.values())
else:
    items = handovers

approved = [h for h in items if h.get('review_status') == 'approved']
print(f'Total handovers: {len(items)}, Approved: {len(approved)}')

for h in approved[:3]:
    print()
    print(f"  handover_id : {h.get('handover_id')}")
    print(f"  phase       : {h.get('phase')}")
    print(f"  status      : {h.get('status')}")
    print(f"  actual_cash : {h.get('actual_cash')}")
    print(f"  expected_cash: {h.get('expected_cash')}")
    print(f"  difference  : {h.get('difference')}")
    print(f"  keys present: {[k for k in h.keys() if 'cash' in k or 'diff' in k]}")

conn.close()
