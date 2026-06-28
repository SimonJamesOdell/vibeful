import json,urllib.request
r=urllib.request.urlopen('http://localhost:50052/v1/pages')
pages=json.loads(r.read())
suite='4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'
sw=[p for p in pages if p['agent_id']==suite]
print("Suite World pages:",len(sw))
for p in sorted(sw,key=lambda x:x['slug']):
    print(" ",p['slug'])
