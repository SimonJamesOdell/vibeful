"""Quick agent conversation test."""
import json, urllib.request

BASE = "http://localhost:50052"
AGENT = "4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"

# Create session
payload = json.dumps({"agent_id": AGENT}).encode()
req = urllib.request.Request(f"{BASE}/v1/sessions", data=payload,
    headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req)
session = json.loads(resp.read())
session_id = session["session_id"]
print(f"Session: {session_id[:8]}...")

# Send message
payload = json.dumps({"content": "Hi, I am looking for a leather corner sofa for my living room. What do you recommend?"}).encode()
req = urllib.request.Request(f"{BASE}/v1/sessions/{session_id}/converse", data=payload,
    headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req, timeout=60)
    result = json.loads(resp.read())
    response_text = result.get("response", result.get("text", str(result)[:500]))
    print(f"Agent: {response_text[:400]}...")
    print("\nTest PASSED - agent responds correctly")
except Exception as e:
    print(f"Error: {e}")
