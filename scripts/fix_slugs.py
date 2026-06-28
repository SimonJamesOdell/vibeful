import json,urllib.request
BASE='http://localhost:50052'
SUITE='4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'
pages=json.loads(urllib.request.urlopen(BASE+'/v1/pages').read())
for p in pages:
    if p['agent_id']==SUITE and p['slug'].endswith('-1'):
        clean=p['slug'][:-2]
        print(f'UPDATE {p["slug"]} -> {clean}')
        payload=json.dumps({'slug':clean}).encode()
        req=urllib.request.Request(BASE+'/v1/pages/'+p['id'],data=payload,headers={'Content-Type':'application/json'},method='PUT')
        try:
            urllib.request.urlopen(req)
            print('  OK')
        except Exception as e:
            print(f'  FAILED: {e}')
print('DONE')
