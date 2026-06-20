# Vibeful Quickstart — PowerShell (Windows)
# One command: .\quickstart.ps1
# Or: .\quickstart.ps1 -SkipVerify -AgentName "My Support Agent"

param(
    [switch]$SkipVerify = $false,
    [string]$AgentName = "Vibeful Helper"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step { Write-Host "[✓] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[!] $args" -ForegroundColor Yellow }
function Write-Err  { Write-Host "[✗] $args" -ForegroundColor Red; exit 1 }
function Write-Info { Write-Host "[i] $args" -ForegroundColor Blue }

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Vibeful — One-Command Quickstart" -ForegroundColor Cyan
Write-Host "  A CMS for AI Agents" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ─────────────────────────────────────────────
Write-Info "Checking prerequisites..."

try { $dockerVersion = docker --version 2>&1 } catch { Write-Err "Docker not found -> https://docs.docker.com/get-docker/" }
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) { Write-Err "Docker daemon not running. Start Docker Desktop first." }
Write-Step "Docker $($dockerVersion -replace '.*version ','')"

# ── .env Setup ────────────────────────────────────────────────
if (-not (Test-Path .env)) {
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Step "Created .env from template"
    } else {
        "DEEPSEEK_API_KEY=sk-your-key-here" | Out-File -Encoding utf8 .env
        Write-Step "Created minimal .env"
    }
}
$envContent = Get-Content .env -Raw
if ($envContent -match "sk-your-key-here|your-deepseek-api-key-here") {
    Write-Err "Set DEEPSEEK_API_KEY in .env -> https://platform.deepseek.com/api_keys"
}
Write-Step "API key configured"

# ── Pull + Build + Start ──────────────────────────────────────
Write-Info "Pulling base images..."
docker compose pull postgres redis envoy 2>$null
Write-Step "Base images ready"

Write-Info "Building Vibeful (this may take ~2 min first time)..."
docker compose build 2>&1 | Select-Object -Last 3
Write-Step "Images built"

Write-Info "Starting services..."
docker compose up -d 2>&1 | Select-Object -Last 5
Write-Step "Services started"

# ── Health Check ──────────────────────────────────────────────
Write-Info "Waiting for proxy..."
$healthy = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 2 -UseBasicParsing
        $healthy = $true
        Write-Step "Proxy healthy"
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $healthy) { Write-Err "Proxy failed to start. Run: docker compose logs proxy" }

# ── Verification ──────────────────────────────────────────────
if (-not $SkipVerify) {
    Write-Info "Running verification..."

    $agentBody = '{"name":"' + $AgentName + '","system_prompt":"You are a helpful assistant. Be concise.","model":"deepseek-chat"}'
    $agentResp = Invoke-RestMethod -Uri "http://localhost:8000/v1/agents" -Method Post -Body $agentBody -ContentType "application/json"
    $agentId = $agentResp.id
    Write-Step "Agent created: $AgentName ($agentId)"

    $sessionResp = Invoke-RestMethod -Uri "http://localhost:8000/v1/sessions" -Method Post -Body "{`"agent_id`":`"$agentId`"}" -ContentType "application/json"
    $sessionId = $sessionResp.session_id
    Write-Step "Session created"

    $convResp = Invoke-RestMethod -Uri "http://localhost:8000/v1/sessions/$sessionId/converse" -Method Post -Body '{"content":"Hello! What can you help me with?"}' -ContentType "application/json"
    $chunks = $convResp.chunks
    $usageChunk = $chunks | Where-Object { $_.state -eq "RESPONSE_STATE_COMPLETED" } | Select-Object -First 1
    if ($usageChunk) {
        $tokens = $usageChunk.usage.total_tokens
        $cost = $usageChunk.usage.cost_usd
        Write-Step "Conversation verified — $tokens tokens, $$cost"
    } else {
        Write-Warn "Conversation check returned unexpected response"
    }
}

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Vibeful is running!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Admin Panel:  http://localhost:5173"
Write-Host "  API Gateway:  http://localhost:3000"
Write-Host "  Proxy:        http://localhost:8000"
Write-Host ""
Write-Host "  Stop:         docker compose down"
Write-Host "  Logs:         docker compose logs -f"
Write-Host "  Restart:      docker compose restart"
Write-Host ""

# ── Open browser ──────────────────────────────────────────────
Start-Process "http://localhost:5173"
Write-Step "Opened Admin Panel in browser"
