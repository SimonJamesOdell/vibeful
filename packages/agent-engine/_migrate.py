import sqlite3
db = sqlite3.connect("vibeful.db")
try:
    db.execute("ALTER TABLE agents ADD COLUMN styling_json TEXT DEFAULT ''")
    print("Added styling_json column")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e):
        print("Column already exists")
    else:
        print(f"Error: {e}")
db.commit()
db.close()
