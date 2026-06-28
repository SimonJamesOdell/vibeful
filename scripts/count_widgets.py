import json,urllib.request
suite='4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'
pages=json.loads(urllib.request.urlopen(f'http://localhost:50052/v1/pages?agent_id={suite}').read())
total=0
for p in sorted(pages,key=lambda x:x['slug']):
    count=p['content_markdown'].count('data-vibeful-widget')
    total+=count
    print(f"{p['slug']:20s}  {count} widgets")
print(f"{'TOTAL':20s}  {total} widgets across {len(pages)} pages")
