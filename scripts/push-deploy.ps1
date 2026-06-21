# Push-and-deploy — pushes to GitHub, then triggers pull + restart on the test machine.
#
# Usage:
#   .\scripts\push-deploy.ps1
#
# Prerequisites on test machine:
#   - OpenSSH Server installed and running
#   - Your SSH key authorized in ~/.ssh/authorized_keys

param(
    [string]$TestHost = "192.168.0.16",
    [string]$TestUser = "simon",
    [string]$RepoPath = "C:\Users\simon\mindset\vibeful"
)

$ErrorActionPreference = "Stop"

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed — aborting" -ForegroundColor Red
    exit 1
}

Write-Host "Deploying to test machine ($TestHost)..." -ForegroundColor Cyan

$remoteCmd = @"
cd `"$RepoPath`"
git pull origin master
cd packages\agent-engine
pip install -e .
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *uvicorn*" 2>nul
Start-Sleep 1
`$env:VIBEFUL_STORAGE = "sqlite"
Start-Process python -ArgumentList "-m","uvicorn","src.rest_server:app","--host","127.0.0.1","--port","50052","--log-level","warning" -WindowStyle Hidden
Write-Host "Deploy complete"
"@

$sshTarget = $TestUser + "@" + $TestHost
ssh $sshTarget $remoteCmd

Write-Host "Done — test machine updated and restarted" -ForegroundColor Green