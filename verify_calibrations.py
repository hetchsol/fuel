import os, json, psycopg
conn = psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=20)
cur = conn.cursor()
row = cur.execute(
    "SELECT data FROM station_files WHERE station_id='ST001' AND filename='tank_calibrations.json'"
).fetchone()
data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
for tid, cal in data.items():
    chart = cal["chart"]
    dips = sorted(float(k) for k in chart)
    vols = [chart[str(d)] for d in dips]
    print(f"{tid}: {cal['point_count']} pts  dip {dips[0]}-{dips[-1]} mm  vol {vols[0]}-{vols[-1]} L  saved {cal['uploaded_at'][:19]}")
conn.close()
