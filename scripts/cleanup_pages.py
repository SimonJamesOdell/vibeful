"""Clean up slug collisions — delete old Kent Sofas pages that collide with ours,
then update Suite World pages to use clean slugs."""
import json, urllib.request

BASE = "http://localhost:50052"
SUITE_WORLD_ID = "4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"

def get(path):
    r = urllib.request.urlopen(f"{BASE}{path}")
    return json.loads(r.read())

def delete(path):
    req = urllib.request.Request(f"{BASE}{path}", method='DELETE')
    r = urllib.request.urlopen(req)
    return json.loads(r.read())

def put_json(path, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(f"{BASE}{path}", data=payload,
        headers={'Content-Type': 'application/json'}, method='PUT')
    r = urllib.request.urlopen(req)
    return json.loads(r.read())

# Get all pages
pages = get("/v1/pages")
print(f"Total pages: {len(pages)}")

# Colliding slugs between Kent Sofas and Suite World
colliding_slugs = {"home", "leather-suites", "fabric-suites", "corner-suites",
                   "recliner-suites", "sofa-beds", "clearance", "about"}

# Delete old Kent Sofas pages that collide
deleted = 0
for p in pages:
    if p["slug"] in colliding_slugs and p["agent_id"] != SUITE_WORLD_ID:
        print(f"Deleting Kent Sofas page: {p['slug']} (id={p['id'][:8]}..)")
        delete(f"/v1/pages/{p['id']}")
        deleted += 1

print(f"Deleted {deleted} colliding pages")

# Update Suite World pages to remove "-1" suffix
for p in pages:
    if p["agent_id"] == SUITE_WORLD_ID and p["slug"].endswith("-1"):
        clean_slug = p["slug"][:-2]  # remove "-1"
        print(f"Updating slug: {p['slug']} -> {clean_slug}")
        put_json(f"/v1/pages/{p['id']}", {"slug": clean_slug})

# Verify
pages2 = get("/v1/pages")
suite_pages = [p for p in pages2 if p["agent_id"] == SUITE_WORLD_ID]
print(f"\n=== Suite World pages: {len(suite_pages)} ===")
for p in suite_pages:
    print(f"  {p['slug']:25s} -> {p['title'][:60]}")

# Test agent-filtered slug lookup
try:
    home = get(f"/v1/pages/slug/home?agent_id={SUITE_WORLD_ID}")
    print(f"\n/v1/pages/slug/home?agent_id={SUITE_WORLD_ID[:8]}...")
    print(f"  Title: {home['title']}")
except Exception as e:
    print(f"\nHome page error: {e}")
