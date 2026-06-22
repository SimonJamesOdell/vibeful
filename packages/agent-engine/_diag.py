import sqlite3

db = sqlite3.connect("vibeful.db")
row = db.execute("SELECT config_json FROM agents WHERE name='bob'").fetchone()
yaml = row[0]

# Replace literal \n with actual newlines (json.dumps side effect)
fixed = yaml.replace('\\n', '\n').replace('\\t', '\t')
# Also strip any remaining outer JSON quotes
fixed = fixed.strip('"')

db.execute("UPDATE agents SET config_json = ? WHERE name='bob'", (fixed,))
db.commit()

# Verify
row2 = db.execute("SELECT config_json FROM agents WHERE name='bob'").fetchone()
result = row2[0]
print(f"Has real newlines: {chr(10) in result}")
print(f"Lines: {len(result.split(chr(10)))}")

import yaml
parsed = yaml.safe_load(result)
if parsed:
    nodes = parsed.get("graph", {}).get("nodes", [])
    print(f"YAML OK: {len(nodes)} nodes")
    for n in nodes:
        print(f"  - {n.get('name')} ({n.get('type')})")
else:
    print("YAML parse failed")

db.close()
