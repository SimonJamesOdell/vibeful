import json,urllib.request
BASE="http://localhost:50052"
AGENT="4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"
# Use the headless execute endpoint
payload=json.dumps({"message":"Hi, I am looking for a leather corner sofa for my living room. What do you recommend?"}).encode()
req=urllib.request.Request(f"{BASE}/v1/agents/{AGENT}/execute",data=payload,headers={"Content-Type":"application/json"})
try:
    resp=urllib.request.urlopen(req,timeout=90)
    result=json.loads(resp.read())
    resp_text=result.get("response",str(result)[:600])
    print(f"Agent response ({len(resp_text)} chars):")
    print(resp_text[:500])
    print("\nTest PASSED")
except Exception as e:
    print(f"Error: {e}")
