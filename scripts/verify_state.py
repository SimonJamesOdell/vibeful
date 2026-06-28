"""Verify vibeful state."""
import json, urllib.request

def get(path):
    r = urllib.request.urlopen(f"http://localhost:50052{path}")
    return json.loads(r.read())

# List agents
agents = get("/v1/agents")
print(f"=== AGENTS ({len(agents)}) ===")
for a in agents:
    print(f"  {a['id'][:8]}..  {a['name']}")

# List pages
pages = get("/v1/pages")
print(f"\n=== PAGES ({len(pages)}) ===")
for p in pages[:25]:
    print(f"  {p['slug']:25s}  ->  {p['title'][:60]}")

# Verify our specific page
try:
    home = get("/v1/pages/slug/home")
    print(f"\n=== /v1/pages/slug/home ===")
    print(f"  Title: {home['title']}")
    print(f"  ID: {home['id']}")
except Exception as e:
    print(f"\n/v1/pages/slug/home error: {e}")
