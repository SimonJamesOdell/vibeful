import urllib.request
r = urllib.request.urlopen('http://localhost:50052/v1/agents/4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71/scaffold')
data = r.read()
print('Status:', r.status)
print('Size:', len(data), 'bytes')
print('Content-Type:', r.headers.get('Content-Type', '?'))
print('CD:', r.headers.get('Content-Disposition', '?')[:80])
