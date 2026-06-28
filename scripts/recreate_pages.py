"""Recreate Suite World pages with clean slugs after deleting colliding ones."""
import json, urllib.request

BASE = "http://localhost:50052"
SUITE = "4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"

# Step 1: get all pages, identify Suite World pages with "-1" suffix
r = urllib.request.urlopen(f"{BASE}/v1/pages")
pages = json.loads(r.read())

to_recreate = []
to_keep_ids = set()

for p in pages:
    if p["agent_id"] == SUITE:
        if p["slug"].endswith("-1"):
            to_recreate.append(p)
        else:
            to_keep_ids.add(p["id"])

print(f"Pages to keep: {len(to_keep_ids)}")
print(f"Pages to recreate: {len(to_recreate)}")

# Step 2: delete the -1 suffixed pages
for p in to_recreate:
    print(f"DELETE {p['slug']} ({p['id'][:8]})")
    req = urllib.request.Request(f"{BASE}/v1/pages/{p['id']}", method="DELETE")
    try:
        urllib.request.urlopen(req)
        print("  OK")
    except Exception as e:
        print(f"  FAILED: {e}")

# Step 3: recreate with clean slugs
for p in to_recreate:
    clean = p["slug"][:-2]  # remove "-1"
    print(f"CREATE {clean}")
    payload = json.dumps({
        "agent_id": SUITE,
        "slug": clean,
        "title": p["title"],
        "content_markdown": p["content_markdown"],
        "published": True
    }).encode("utf-8")
    req = urllib.request.Request(f"{BASE}/v1/pages", data=payload,
        headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f"  OK -> slug={result['slug']}")
    except Exception as e:
        print(f"  FAILED: {e}")

# Step 4: verify
r2 = urllib.request.urlopen(f"{BASE}/v1/pages?agent_id={SUITE}")
pages2 = json.loads(r2.read())
print(f"\n=== Final Suite World pages: {len(pages2)} ===")
for p in sorted(pages2, key=lambda x: x['slug']):
    print(f"  {p['slug']}")
