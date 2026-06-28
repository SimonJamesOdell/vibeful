import sqlite3
db = sqlite3.connect("vibeful.db")

# ── styling_json ──────────────────────────────────────
try:
    db.execute("ALTER TABLE agents ADD COLUMN styling_json TEXT DEFAULT ''")
    print("Added styling_json column")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e):
        print("styling_json: already exists")
    else:
        print(f"styling_json error: {e}")

# ── updated_at ────────────────────────────────────────
try:
    # SQLite ALTER TABLE doesn't allow non-constant defaults
    db.execute("ALTER TABLE agents ADD COLUMN updated_at TEXT")
    print("Added updated_at column")
    # Backfill — copy from created_at, fall back to current time
    db.execute("UPDATE agents SET updated_at = COALESCE(created_at, datetime('now'))")
    print("Backfilled updated_at")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e):
        print("updated_at: already exists")
    else:
        print(f"updated_at error: {e}")

db.commit()
db.close()
