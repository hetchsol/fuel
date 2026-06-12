#!/usr/bin/env python3
"""Force-logout everyone: delete all rows from the sessions table (all stations).
Invalidates every login token so no authenticated write can occur during a cutover."""
import os, sys
DB = os.getenv("DATABASE_URL") or sys.exit("set DATABASE_URL")
import psycopg
conn = psycopg.connect(DB, connect_timeout=30)
cur = conn.cursor()
before = cur.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
cur.execute("DELETE FROM sessions")
conn.commit()
after = cur.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
print(f"sessions: {before} -> {after}  (everyone logged out)")
conn.close()
