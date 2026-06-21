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
    [string]$RepoPath = "~/vibeful"
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
cd $RepoPath
git pull origin master
cd packages/agent-engine
pkill -f 'uvicorn src.rest_server' 2>/dev/null
sleep 1
VIBEFUL_STORAGE=sqlite nohup python -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052 --log-level warning > /dev/null 2>&1 &
echo "Deploy complete"
"@

ssh "$TestUser@$TestHost" $remoteCmd

Write-Host "Done — test machine updated and restarted" -ForegroundColor Green
