import json,urllib.request
BASE='http://localhost:50052'
r=urllib.request.urlopen(BASE+'/v1/pages')
pages=json.loads(r.read())
collide={'home','leather-suites','fabric-suites','corner-suites','recliner-suites','sofa-beds','clearance','about'}
SUITE='4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'
# 1. Delete colliding Kent Sofas pages
for p in pages:
    if p['slug'] in collide and p['agent_id']!=SUITE:
        print('DELETE '+p['slug']+' ('+p['id'][:8]+')')
        req=urllib.request.Request(BASE+'/v1/pages/'+p['id'],method='DELETE')
        urllib.request.urlopen(req)
# 2. Fix Suite World slugs (remove -1 suffix)
r2=urllib.request.urlopen(BASE+'/v1/pages')
pages2=json.loads(r2.read())
for p in pages2:
    if p['agent_id']==SUITE and p['slug'].endswith('-1'):
        clean=p['slug'][:-2]
        print('UPDATE '+p['slug']+' -> '+clean)
        payload=json.dumps({'slug':clean}).encode()
        req=urllib.request.Request(BASE+'/v1/pages/'+p['id'],data=payload,headers={'Content-Type':'application/json'},method='PUT')
        urllib.request.urlopen(req)
print('DONE')
