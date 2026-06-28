import json,urllib.request
payload=json.dumps({'agent_id':'4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'}).encode()
req=urllib.request.Request('http://localhost:50052/v1/sessions',data=payload,headers={'Content-Type':'application/json'})
resp=urllib.request.urlopen(req)
session=json.loads(resp.read())
print(json.dumps(session,indent=2)[:600])
